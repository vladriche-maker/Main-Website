// signup-guard.js
// Bot protection for the public form endpoints (/subscribe, /score-submit, /contact).
// No secrets live in this file. Optional settings come from environment variables:
//
//   TURNSTILE_SITE_KEY      Cloudflare Turnstile site key (public). Enables the widget on forms.
//   TURNSTILE_SECRET_KEY    Cloudflare Turnstile secret key. Enables server-side verification.
//                           Set BOTH keys to turn Turnstile on. Leave both empty to run without it.
//   FORM_SECRET             Any long random string. Signs the form timing token.
//   SIGNUP_IP_LIMIT         Max signups per IP per hour. Default 5.
//   SIGNUP_GLOBAL_LIMIT     Max signups across the whole site per hour. Default 60.
//   SUBSCRIBE_GROUPS        Optional, comma-separated extra MailerLite group ids to allow.

const crypto = require('crypto');
const dns = require('dns').promises;
const https = require('https');

const HOUR = 60 * 60 * 1000;
const MIN_FILL_MS = 3000;          // a human takes longer than 3 seconds to fill a form
const MAX_TOKEN_AGE_MS = 2 * HOUR; // page left open longer than this must be reloaded

const SECRET = process.env.FORM_SECRET || crypto.randomBytes(32).toString('hex');
const IP_LIMIT = parseInt(process.env.SIGNUP_IP_LIMIT, 10) || 5;
const GLOBAL_LIMIT = parseInt(process.env.SIGNUP_GLOBAL_LIMIT, 10) || 60;

// MailerLite groups the site is allowed to write into. Group ids are not secrets,
// they are already visible in the page source. The point is that a bot cannot
// choose a group of its own.
const ALLOWED_GROUPS = new Set([
  '182792861833495840', // 5 Associate Tells
  '181118675986679261', // 5 Wardrobe Decisions
  '183561091552380082', // 10 Suit Mistakes
  '199357439310562614', // Workshop confirmed
  '199357504039159053', // Workshop replay access
  '199265122678474097', // Scorecard
  ...(process.env.SUBSCRIBE_GROUPS || '').split(',').map(s => s.trim()).filter(Boolean),
]);

const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com', 'grr.la',
  '10minutemail.com', '10minutemail.net', 'tempmail.com', 'temp-mail.org', 'temp-mail.io',
  'throwawaymail.com', 'yopmail.com', 'yopmail.net', 'trashmail.com', 'getnada.com',
  'maildrop.cc', 'dispostable.com', 'fakeinbox.com', 'mintemail.com', 'mohmal.com',
  'emailondeck.com', 'tempail.com', 'burnermail.io', 'spamgourmet.com', 'moakt.com',
  'mailnesia.com', 'tmpmail.org', 'tmpmail.net', 'discard.email', 'mail.tm', 'inboxkitten.com',
  'owlymail.com', 'dropmail.me', 'emltmp.com', 'tmail.ws', 'linshiyouxiang.net',
]);

// ---------- tiny in-memory limiter (no extra dependency) ----------
const ipHits = new Map(); // ip -> [timestamps]
let globalHits = [];

function prune(arr, now) {
  while (arr.length && now - arr[0] > HOUR) arr.shift();
  return arr;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, arr] of ipHits) {
    prune(arr, now);
    if (!arr.length) ipHits.delete(ip);
  }
  prune(globalHits, now);
}, 10 * 60 * 1000).unref();

function clientIp(req) {
  return req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
}

// Returns true if the request is allowed, and records it.
function takeSlot(req, ipLimit, globalLimit) {
  const now = Date.now();
  const ip = clientIp(req);
  const mine = prune(ipHits.get(ip) || [], now);
  prune(globalHits, now);
  if (mine.length >= ipLimit) return false;
  if (globalLimit && globalHits.length >= globalLimit) return false;
  mine.push(now);
  ipHits.set(ip, mine);
  if (globalLimit) globalHits.push(now);
  return true;
}

// ---------- signed timing token ----------
function sign(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
}

function issueToken() {
  const ts = String(Date.now());
  return ts + '.' + sign(ts);
}

function tokenOk(token) {
  if (typeof token !== 'string') return false;
  const [ts, sig] = token.split('.');
  if (!ts || !sig || !/^\d+$/.test(ts)) return false;
  const expected = sign(ts);
  if (sig.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  const age = Date.now() - Number(ts);
  return age >= MIN_FILL_MS && age <= MAX_TOKEN_AGE_MS;
}

// ---------- email checks ----------
function emailShapeOk(email) {
  if (typeof email !== 'string') return false;
  if (email.length < 6 || email.length > 120) return false;
  if (!/^[^\s@<>"',;()\\]+@[^\s@<>"',;()\\]+\.[^\s@<>"',;()\\]{2,}$/.test(email)) return false;
  return true;
}

function isDisposable(email) {
  const domain = email.split('@')[1].toLowerCase();
  return DISPOSABLE.has(domain);
}

async function domainCanReceiveMail(email) {
  const domain = email.split('@')[1];
  const withTimeout = (p) =>
    Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000))]);
  try {
    const mx = await withTimeout(dns.resolveMx(domain));
    if (mx && mx.length) return true;
  } catch (e) {
    if (e && (e.code === 'ENOTFOUND' || e.code === 'ENODATA')) {
      // No MX. Fall back to an A record, which mail servers also accept.
      try {
        const a = await withTimeout(dns.resolve4(domain));
        return !!(a && a.length);
      } catch (e2) {
        if (e2 && (e2.code === 'ENOTFOUND' || e2.code === 'ENODATA')) return false;
        return true; // lookup trouble, do not punish a real visitor
      }
    }
    return true; // timeout or resolver trouble: fail open
  }
  return false;
}

// ---------- Cloudflare Turnstile (optional) ----------
const turnstileOn = () => !!(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY);

function verifyTurnstile(token, ip) {
  return new Promise((resolve) => {
    if (!token || typeof token !== 'string') return resolve(false);
    const body = new URLSearchParams({
      secret: process.env.TURNSTILE_SECRET_KEY,
      response: token,
      remoteip: ip,
    }).toString();
    const req = https.request({
      host: 'challenges.cloudflare.com',
      path: '/turnstile/v0/siteverify',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
      timeout: 5000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(!!JSON.parse(data).success); } catch (e) { resolve(false); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
    req.write(body);
    req.end();
  });
}

function escapeHtml(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---------- the one check every signup endpoint runs ----------
// Returns { ok: true } or { ok: false, status, message, silent }.
// silent = true means pretend success to the caller (used for honeypot hits,
// so bots get no signal about what tripped them).
async function checkSignup(req, opts) {
  const o = Object.assign({ requireToken: true, checkMx: true, turnstile: true }, opts || {});
  const b = req.body || {};

  // 1. Honeypot: real people never see this field.
  if (b.website) return { ok: false, silent: true };

  // 2. Cheap checks first, so junk requests cost nothing and never use up a rate-limit slot.
  //    The signed timing token proves the visitor loaded the page and took a human amount of time.
  if (o.requireToken && !tokenOk(b.gt)) {
    return { ok: false, status: 400, message: 'Please reload the page and try again.' };
  }
  const email = typeof b.email === 'string' ? b.email.trim() : '';
  if (!emailShapeOk(email)) return { ok: false, status: 400, message: 'Please enter a valid email address.' };
  if (isDisposable(email)) return { ok: false, status: 400, message: 'Please use a permanent email address.' };

  // 3. Rate limits. Only requests that passed the cheap checks count.
  if (!takeSlot(req, IP_LIMIT, GLOBAL_LIMIT)) {
    return { ok: false, status: 429, message: 'Too many sign-ups right now. Please try again later.' };
  }

  // 4. Turnstile, when configured.
  if (o.turnstile && turnstileOn()) {
    const pass = await verifyTurnstile(b.cf, clientIp(req));
    if (!pass) return { ok: false, status: 400, message: 'Please complete the verification and try again.' };
  }

  // 5. The email's domain must be able to receive mail.
  if (o.checkMx && !(await domainCanReceiveMail(email))) {
    return { ok: false, status: 400, message: 'That email domain does not look right. Please check it.' };
  }

  return { ok: true, email };
}

module.exports = {
  ALLOWED_GROUPS,
  issueToken,
  turnstileOn,
  checkSignup,
  takeSlot,
  escapeHtml,
  clientIp,
  config: () => ({ turnstileSiteKey: turnstileOn() ? process.env.TURNSTILE_SITE_KEY : '', token: issueToken() }),
};
