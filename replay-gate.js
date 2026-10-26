// replay-gate.js
// Members-only replay access for Dressed in the Dark.
// A visitor enters the email they used at Stripe checkout. The server asks Stripe
// whether that email has a completed, paid checkout on one of the approved
// payment links. Only then does it hand back the video and bonus content.
//
// Setup (Hostinger > Node.js app > Environment variables):
//   STRIPE_RESTRICTED_KEY   Stripe restricted key (rk_live_...) with READ access
//                           to "Checkout Sessions" only. Nothing else.
//   REPLAY_VIMEO_ID         the Vimeo video ID
//   REPLAY_VIMEO_HASH       the h= value from the unlisted Vimeo link, if it has one
//   REPLAY_GPT_URL          link to the Trousers GPT
//   REPLAY_EDIT_CODE        the Edit discount code shown to buyers
//   REPLAY_ALLOW_EMAILS     optional, comma-separated emails that always get in
//                           (use it for your own testing)
//   REPLAY_EXTRA_LINKS      optional, comma-separated extra payment link IDs
//
// This repo is public, so nothing secret is kept in this file. Everything the
// gate protects lives in the environment variables above.
//
// Wire-up in server.js, right after the express.static(...) line:
//   require('./replay-gate')(app);

const https = require('https');
const crypto = require('crypto');
const path = require('path');
const express = require('express');

// ---------- Content shown only after access is verified ----------
// Read from environment variables on every request, never stored in the repo.
function content() {
  return {
    vimeoId: process.env.REPLAY_VIMEO_ID || '',
    vimeoHash: process.env.REPLAY_VIMEO_HASH || '',
    gptUrl: process.env.REPLAY_GPT_URL || '',
    editCode: process.env.REPLAY_EDIT_CODE || ''
  };
}

// ---------- Payment links whose buyers get access ----------
// $9 "Everything Hangs on the Trousers" workshop ticket
// $39 replay sold after the live session
const BASE_LINKS = ['plink_1UQCclCMFNm6WbxSr6rgw5Jk', 'plink_1UU8UlCMFNm6WbxSRrsgwpB2'];

const TOKEN_DAYS = 90;
const MAX_ATTEMPTS = 8;            // per IP
const WINDOW_MS = 15 * 60 * 1000;  // per 15 minutes

function list(value) {
  return (value || '').split(',').map(s => s.trim()).filter(Boolean);
}

function stripeGetDefault(key, pathAndQuery) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: 'api.stripe.com',
      path: pathAndQuery,
      method: 'GET',
      headers: { Authorization: 'Bearer ' + key }
    }, res => {
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(json);
          else reject(new Error('stripe_' + res.statusCode));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('stripe_timeout')));
    req.end();
  });
}

module.exports = function replayGate(app, opts) {
  opts = opts || {};
  const stripeGet = opts.stripeGet || stripeGetDefault;
  const getKey = opts.getKey || (() => process.env.STRIPE_RESTRICTED_KEY || '');
  const attempts = new Map();

  function secret() {
    const explicit = process.env.REPLAY_SECRET;
    if (explicit) return explicit;
    return crypto.createHash('sha256').update('replay|' + getKey()).digest('hex');
  }

  function sign(payload) {
    return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  }

  function makeToken(email) {
    const exp = Date.now() + TOKEN_DAYS * 24 * 60 * 60 * 1000;
    const payload = Buffer.from(JSON.stringify({ e: email, x: exp })).toString('base64url');
    return payload + '.' + sign(payload);
  }

  function readToken(token) {
    if (typeof token !== 'string' || token.length > 600) return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const expected = sign(parts[0]);
    const a = Buffer.from(parts[1]);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
      const data = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
      if (!data.x || data.x < Date.now()) return null;
      return data;
    } catch (e) { return null; }
  }

  function clientIp(req) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) return String(xff).split(',')[0].trim();
    return req.ip || 'unknown';
  }

  function limited(req) {
    const ip = clientIp(req);
    const now = Date.now();
    const rec = attempts.get(ip);
    if (!rec || rec.reset < now) {
      attempts.set(ip, { count: 1, reset: now + WINDOW_MS });
      return false;
    }
    rec.count += 1;
    return rec.count > MAX_ATTEMPTS;
  }

  async function hasPurchase(email) {
    const allow = list(process.env.REPLAY_ALLOW_EMAILS).map(s => s.toLowerCase());
    if (allow.includes(email)) return true;

    const key = getKey();
    if (!key) {
      const err = new Error('not_configured');
      err.code = 'not_configured';
      throw err;
    }
    // Stripe cannot filter by email and payment link in one request, so fetch this
    // email's completed checkouts and match the payment link here.
    const links = BASE_LINKS.concat(list(process.env.REPLAY_EXTRA_LINKS));
    const q = new URLSearchParams();
    q.set('customer_details[email]', email);
    q.set('status', 'complete');
    q.set('limit', '100');
    const res = await stripeGet(key, '/v1/checkout/sessions?' + q.toString());
    return (res.data || []).some(s =>
      links.includes(s.payment_link) &&
      (s.payment_status === 'paid' || s.payment_status === 'no_payment_required')
    );
  }

  // Clean URL for the replay page
  app.get(['/replay', '/workshop/replay'], (req, res) => {
    res.set('X-Robots-Tag', 'noindex, nofollow');
    res.sendFile(path.join(__dirname, 'public', 'workshop-replay.html'));
  });

  app.post('/api/replay/unlock', express.json(), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (limited(req)) return res.status(429).json({ ok: false, error: 'too_many' });

    const raw = req.body && typeof req.body.email === 'string' ? req.body.email.trim() : '';
    if (!raw || raw.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
      return res.status(400).json({ ok: false, error: 'bad_email' });
    }
    const email = raw.toLowerCase();

    try {
      let ok = await hasPurchase(email);
      if (!ok && raw !== email) ok = await hasPurchase(raw);
      if (!ok) return res.status(403).json({ ok: false, error: 'no_purchase' });
      return res.json({ ok: true, token: makeToken(email), content: content() });
    } catch (e) {
      if (e && e.code === 'not_configured') {
        return res.status(503).json({ ok: false, error: 'not_configured' });
      }
      console.error('Replay access check failed:', e && e.message);
      return res.status(502).json({ ok: false, error: 'check_failed' });
    }
  });

  app.post('/api/replay/verify', express.json(), (req, res) => {
    res.set('Cache-Control', 'no-store');
    const data = readToken(req.body && req.body.token);
    if (!data) return res.status(401).json({ ok: false });
    return res.json({ ok: true, content: content() });
  });
};
