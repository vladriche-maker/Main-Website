const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');
const guard = require('./signup-guard');

const app = express();
const PORT = process.env.PORT || 3000;

// Hostinger sits behind a proxy. This makes req.ip the real visitor IP,
// which the rate limits rely on.
app.set('trust proxy', 1);

// Parse incoming JSON and form data
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: true, limit: '20kb' }));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

require('./replay-gate')(app);

// Public settings the forms need: the signed timing token and, if enabled, the Turnstile site key.
app.get('/api/form-config', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(guard.config());
});

// -------------------------------------------------------
// Contact form endpoint
// -------------------------------------------------------
// Before deploying, set these environment variables in
// Hostinger's Node.js app settings:
//   SMTP_HOST  → e.g. smtp.hostinger.com
//   SMTP_PORT  → e.g. 465
//   SMTP_USER  → your sending email address
//   SMTP_PASS  → your email password
// -------------------------------------------------------
app.post('/contact', async (req, res) => {
  if (!guard.takeSlot(req, 5, 40)) {
    return res.status(429).json({ success: false, message: 'Too many messages. Please try again later.' });
  }
  const e = guard.escapeHtml;
  const { name, email, linkedin, industry, challenge, reason } = req.body;

  // Basic validation
  if (!name || !email || !linkedin || !industry) {
    return res.status(400).json({ success: false, message: 'Please fill in all required fields.' });
  }

  try {
    const smtpPort = parseInt(process.env.SMTP_PORT) || 465;
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.hostinger.com',
      port: smtpPort,
      secure: smtpPort === 465,   // true for SSL on 465, false (STARTTLS) for 587
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: `"Vladimir Riché Website" <${process.env.SMTP_USER}>`,
      to: 'vr@chaceandryder.com',
      replyTo: email,
      subject: `New Inquiry — ${String(name).replace(/[\r\n]/g, ' ').slice(0, 80)} (${String(industry).replace(/[\r\n]/g, ' ').slice(0, 40)})`,
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
          <div style="background: #2C4669; padding: 24px 32px;">
            <h1 style="color: #ffffff; margin: 0; font-size: 20px; letter-spacing: 2px; font-family: sans-serif; font-weight: 300;">VLADIMIR RICHÉ</h1>
            <p style="color: #FF7924; margin: 4px 0 0; font-size: 13px; letter-spacing: 1px; font-family: sans-serif;">NEW CONTACT FORM SUBMISSION</p>
          </div>
          <div style="padding: 32px; background: #f8f7f5; border: 1px solid #e8e4de;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 12px 0; border-bottom: 1px solid #e8e4de; font-size: 13px; color: #888; letter-spacing: 1px; font-family: sans-serif; text-transform: uppercase; width: 40%;">Name</td><td style="padding: 12px 0; border-bottom: 1px solid #e8e4de; font-size: 16px;">${e(name)}</td></tr>
              <tr><td style="padding: 12px 0; border-bottom: 1px solid #e8e4de; font-size: 13px; color: #888; letter-spacing: 1px; font-family: sans-serif; text-transform: uppercase;">Email</td><td style="padding: 12px 0; border-bottom: 1px solid #e8e4de; font-size: 16px;"><a href="mailto:${e(email)}" style="color: #2974B0;">${e(email)}</a></td></tr>
              <tr><td style="padding: 12px 0; border-bottom: 1px solid #e8e4de; font-size: 13px; color: #888; letter-spacing: 1px; font-family: sans-serif; text-transform: uppercase;">LinkedIn</td><td style="padding: 12px 0; border-bottom: 1px solid #e8e4de; font-size: 16px;"><a href="${e(linkedin)}" style="color: #2974B0;">${e(linkedin)}</a></td></tr>
              <tr><td style="padding: 12px 0; border-bottom: 1px solid #e8e4de; font-size: 13px; color: #888; letter-spacing: 1px; font-family: sans-serif; text-transform: uppercase;">Industry</td><td style="padding: 12px 0; border-bottom: 1px solid #e8e4de; font-size: 16px;">${e(industry)}</td></tr>
              <tr><td style="padding: 12px 0; border-bottom: 1px solid #e8e4de; font-size: 13px; color: #888; letter-spacing: 1px; font-family: sans-serif; text-transform: uppercase; vertical-align: top;">Style Challenge</td><td style="padding: 12px 0; border-bottom: 1px solid #e8e4de; font-size: 16px;">${e(challenge) || '—'}</td></tr>
              <tr><td style="padding: 12px 0; font-size: 13px; color: #888; letter-spacing: 1px; font-family: sans-serif; text-transform: uppercase; vertical-align: top;">Why Now</td><td style="padding: 12px 0; font-size: 16px;">${e(reason) || '—'}</td></tr>
            </table>
          </div>
        </div>
      `,
    });

    res.json({ success: true, message: 'Your message has been sent.' });
  } catch (error) {
    console.error('Email send error:', error);
    res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
});

// ── Page routes (clean URLs for single-page app) ──
// These serve index.html; the JS reads the path and shows the right section
['/about', '/contact', '/resources'].forEach(route => {
  app.get(route, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
});

// /edit shows the Edit section of the main site
app.get('/edit', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Dedicated sub-pages
app.get('/book', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'book.html'));
});

app.get('/5signals', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', '5signals.html'));
});

app.get('/wardrobe-decisions', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'wardrobe-decisions.html'));
});

app.get('/suit-mistakes', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'suit-mistakes.html'));
});

app.get('/score', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'score.html'));
});

// Unlisted Wardrobe Edit page (linked from workshop emails, not in the menu)
app.get('/wardrobe-edit', (req, res) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.sendFile(path.join(__dirname, 'public', 'wardrobe-edit.html'));
});

app.get('/wardrobe-edit/confirmed', (req, res) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.sendFile(path.join(__dirname, 'public', 'wardrobe-edit-confirmed.html'));
});

app.get('/edit/confirmed', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'edit-confirmed.html'));
});

app.get('/workshop', (req, res) => {
  res.redirect(302, '/workshop-trousers.html');
});

app.get('/workshop/confirmed', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'workshop-confirmed.html'));
});

app.get('/workshop/replay-access', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'workshop-replay-access.html'));
});

app.get('/capsule-guide', (req, res) => {
  res.redirect(301, 'https://chatgpt.com/g/g-691dcf33abb88191b28a7f683790512b-capsule-wardrobe-guide');
});

// ── MailerLite subscribe endpoint ──────────────────
// Add MAILERLITE_API_KEY to your Hostinger environment variables
app.post('/subscribe', async (req, res) => {
  const groupId = String((req.body && req.body.groupId) || '');
  const rawName = (req.body && req.body.name) || '';
  const name = typeof rawName === 'string' ? rawName.trim().slice(0, 60) : '';

  // Only groups this site actually uses. A bot cannot pick its own.
  if (!guard.ALLOWED_GROUPS.has(groupId)) {
    return res.status(400).json({ success: false, message: 'Could not subscribe. Please try again.' });
  }

  const check = await guard.checkSignup(req, { turnstile: false });
  if (!check.ok) {
    if (check.silent) return res.json({ success: true }); // honeypot: look successful, do nothing
    return res.status(check.status).json({ success: false, message: check.message });
  }
  const email = check.email;

  try {
    const payload = {
      email,
      groups: [groupId]
    };
    if (name) payload.fields = { name };

    const response = await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MAILERLITE_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (response.ok || response.status === 200 || response.status === 201) {
      // An upsert does not reliably add an ALREADY EXISTING subscriber to a
      // group, so assign it explicitly. Safe for new subscribers too.
      const id = data && data.data && data.data.id;
      if (id) {
        try {
          const g = await fetch(
            `https://connect.mailerlite.com/api/subscribers/${id}/groups/${groupId}`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${process.env.MAILERLITE_API_KEY}`,
                'Accept': 'application/json'
              }
            }
          );
          if (!g.ok) console.error('MailerLite group assign failed:', g.status, await g.text());
        } catch (e) {
          console.error('MailerLite group assign error:', e);
        }
      }
      res.json({ success: true });
    } else {
      console.error('MailerLite error:', data);
      res.status(400).json({ success: false, message: 'Could not subscribe. Please try again.' });
    }
  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({ success: false, message: 'Something went wrong.' });
  }
});

// ── Partner Wardrobe System Score submissions ──────
// Emails the result to VR, then writes the subscriber into MailerLite.
// Optional env var: MAILERLITE_SCORE_GROUP (a MailerLite group id).
// Points available in each area of the scorecard: four per question.
// These have to match the questions in public/score.html. Foundation, Fit and
// Decision carry three questions each. Acquisition and Room carry four.
const DIM_MAX = {
  foundation: 12,
  fit: 12,
  decision: 12,
  acquisition: 16,
  room: 16,
};

app.post('/score-submit', async (req, res) => {
  const d = req.body || {};

  const check = await guard.checkSignup(req);
  if (!check.ok) {
    if (check.silent) return res.json({ success: true });
    return res.status(check.status).json({ success: false, message: check.message });
  }

  const name = String(d.name || '').slice(0, 120);
  const email = check.email;
  const e = guard.escapeHtml;
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const txt = (v) => String(v == null ? '' : v).slice(0, 120);

  const score = {
    score_total:       num(d.score_total),
    score_tier:        txt(d.score_tier),
    score_weakest:     txt(d.score_weakest),
    score_foundation:  num(d.score_foundation),
    score_fit:         num(d.score_fit),
    score_decision:    num(d.score_decision),
    score_acquisition: num(d.score_acquisition),
    score_room:        num(d.score_room),
    promo_window:      txt(d.promo_window),
    firm_type:         txt(d.firm_type),
    location:          txt(d.location),
  };

  // A hard ICP match: newly named, in law, in the New York metro.
  const icpMatch =
    score.promo_window === '6 to 18 months' &&
    score.firm_type === 'Law' &&
    score.location === 'New York metro';

  // Answer the browser now. The notification and the MailerLite write happen
  // after, so a slow mail server never holds up someone's result.
  res.json({ success: true });

  // 1. Notify VR. Uses the same SMTP settings as the contact form.
  try {
    const smtpPort = parseInt(process.env.SMTP_PORT) || 465;
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.hostinger.com',
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });

    const row = (label, value) =>
      `<tr><td style="padding:10px 0;border-bottom:1px solid #e8e4de;font-size:12px;color:#888;letter-spacing:1px;font-family:sans-serif;text-transform:uppercase;width:45%;">${label}</td>` +
      `<td style="padding:10px 0;border-bottom:1px solid #e8e4de;font-size:16px;">${value}</td></tr>`;

    await transporter.sendMail({
      from: `"Partner Wardrobe Score" <${process.env.SMTP_USER}>`,
      to: 'vr@chaceandryder.com',
      replyTo: email,
      subject: `Score ${score.score_total}% — ${String(name || email).replace(/[\r\n]/g, ' ')}${icpMatch ? ' — ICP MATCH' : ''}`,
      html: `
        <div style="font-family: Georgia, serif; max-width: 620px; margin: 0 auto; color: #1a1a1a;">
          <div style="background:#2C4669;padding:24px 32px;">
            <h1 style="color:#fff;margin:0;font-size:20px;letter-spacing:2px;font-family:sans-serif;font-weight:300;">VLADIMIR RICH&Eacute;</h1>
            <p style="color:#FF7924;margin:4px 0 0;font-size:13px;letter-spacing:1px;font-family:sans-serif;">PARTNER WARDROBE SYSTEM SCORE</p>
          </div>
          <div style="padding:32px;background:#f8f7f5;border:1px solid #e8e4de;">
            ${icpMatch ? '<p style="margin:0 0 20px;padding:10px 14px;background:#FF7924;color:#fff;font-family:sans-serif;font-size:13px;letter-spacing:1px;">HARD ICP MATCH</p>' : ''}
            <table style="width:100%;border-collapse:collapse;">
              ${row('Name', e(name) || '&mdash;')}
              ${row('Email', `<a href="mailto:${e(email)}" style="color:#2974B0;">${e(email)}</a>`)}
              ${row('Score', `<strong>${score.score_total}%</strong> &nbsp; ${e(score.score_tier)}`)}
              ${row('Weakest area', e(score.score_weakest))}
              ${row('Foundation', score.score_foundation + ' / ' + DIM_MAX.foundation)}
              ${row('Fit', score.score_fit + ' / ' + DIM_MAX.fit)}
              ${row('Decision', score.score_decision + ' / ' + DIM_MAX.decision)}
              ${row('Acquisition', score.score_acquisition + ' / ' + DIM_MAX.acquisition)}
              ${row('Room', score.score_room + ' / ' + DIM_MAX.room)}
              ${row('Since promotion', e(score.promo_window) || '&mdash;')}
              ${row('Firm type', e(score.firm_type) || '&mdash;')}
              ${row('Location', e(score.location) || '&mdash;')}
            </table>
          </div>
        </div>`,
    });
  } catch (err) {
    console.error('Score notification email failed:', err);
  }

  // 2. Write the subscriber into MailerLite. Never blocks the visitor's result.
  try {
    if (process.env.MAILERLITE_API_KEY) {
      // The Scorecard group in MailerLite. Not a secret, just an id, so it
      // lives here rather than in an environment variable. Set
      // MAILERLITE_SCORE_GROUP in Hostinger to override it without a code change.
      const group = process.env.MAILERLITE_SCORE_GROUP || '199265122678474097';
      const auth = {
        'Authorization': `Bearer ${process.env.MAILERLITE_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };

      // Scorecard takers answered seventeen questions and typed their own
      // address to see the result, so they are not asked to confirm it again.
      // 'active' skips the MailerLite confirmation email for this path only.
      // Every other signup on the site keeps double opt-in.
      const payload = {
        email,
        fields: Object.assign({ name }, score),
        status: 'active',
      };
      if (group) payload.groups = [group];

      const r = await fetch('https://connect.mailerlite.com/api/subscribers', {
        method: 'POST',
        headers: auth,
        body: JSON.stringify(payload),
      });
      const body = await r.json().catch(() => null);

      if (!r.ok) {
        console.error('MailerLite score subscribe failed:', r.status, JSON.stringify(body));
      } else if (!group) {
        console.log('MailerLite: no group id available, subscriber saved without a group');
      } else {
        // An upsert does not reliably add an ALREADY EXISTING subscriber to a
        // group, so assign it explicitly. Safe for new subscribers too.
        const id = body && body.data && body.data.id;
        if (!id) {
          console.error('MailerLite: no subscriber id returned, cannot assign group');
        } else {
          const g = await fetch(
            `https://connect.mailerlite.com/api/subscribers/${id}/groups/${group}`,
            { method: 'POST', headers: auth }
          );
          if (!g.ok) {
            console.error('MailerLite group assign failed:', g.status, await g.text());
          } else {
            console.log('MailerLite: subscriber', id, 'assigned to group', group);
          }
        }
      }
    }
  } catch (err) {
    console.error('MailerLite score subscribe error:', err);
  }
});

// Catch-all: serve index.html for any unmatched route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
