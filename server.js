const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Parse incoming JSON and form data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

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
      subject: `New Inquiry — ${name} (${industry})`,
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
          <div style="background: #2C4669; padding: 24px 32px;">
            <h1 style="color: #ffffff; margin: 0; font-size: 20px; letter-spacing: 2px; font-family: sans-serif; font-weight: 300;">VLADIMIR RICHÉ</h1>
            <p style="color: #FF7924; margin: 4px 0 0; font-size: 13px; letter-spacing: 1px; font-family: sans-serif;">NEW CONTACT FORM SUBMISSION</p>
          </div>
          <div style="padding: 32px; background: #f8f7f5; border: 1px solid #e8e4de;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 12px 0; border-bottom: 1px solid #e8e4de; font-size: 13px; color: #888; letter-spacing: 1px; font-family: sans-serif; text-transform: uppercase; width: 40%;">Name</td><td style="padding: 12px 0; border-bottom: 1px solid #e8e4de; font-size: 16px;">${name}</td></tr>
              <tr><td style="padding: 12px 0; border-bottom: 1px solid #e8e4de; font-size: 13px; color: #888; letter-spacing: 1px; font-family: sans-serif; text-transform: uppercase;">Email</td><td style="padding: 12px 0; border-bottom: 1px solid #e8e4de; font-size: 16px;"><a href="mailto:${email}" style="color: #2974B0;">${email}</a></td></tr>
              <tr><td style="padding: 12px 0; border-bottom: 1px solid #e8e4de; font-size: 13px; color: #888; letter-spacing: 1px; font-family: sans-serif; text-transform: uppercase;">LinkedIn</td><td style="padding: 12px 0; border-bottom: 1px solid #e8e4de; font-size: 16px;"><a href="${linkedin}" style="color: #2974B0;">${linkedin}</a></td></tr>
              <tr><td style="padding: 12px 0; border-bottom: 1px solid #e8e4de; font-size: 13px; color: #888; letter-spacing: 1px; font-family: sans-serif; text-transform: uppercase;">Industry</td><td style="padding: 12px 0; border-bottom: 1px solid #e8e4de; font-size: 16px;">${industry}</td></tr>
              <tr><td style="padding: 12px 0; border-bottom: 1px solid #e8e4de; font-size: 13px; color: #888; letter-spacing: 1px; font-family: sans-serif; text-transform: uppercase; vertical-align: top;">Style Challenge</td><td style="padding: 12px 0; border-bottom: 1px solid #e8e4de; font-size: 16px;">${challenge || '—'}</td></tr>
              <tr><td style="padding: 12px 0; font-size: 13px; color: #888; letter-spacing: 1px; font-family: sans-serif; text-transform: uppercase; vertical-align: top;">Why Now</td><td style="padding: 12px 0; font-size: 16px;">${reason || '—'}</td></tr>
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

app.get('/edit/confirmed', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'edit-confirmed.html'));
});

app.get('/capsule-guide', (req, res) => {
  res.redirect(301, 'https://chatgpt.com/g/g-691dcf33abb88191b28a7f683790512b-capsule-wardrobe-guide');
});

// ── MailerLite subscribe endpoint ──────────────────
// Add MAILERLITE_API_KEY to your Hostinger environment variables
app.post('/subscribe', async (req, res) => {
  const { name, email, groupId } = req.body;

  if (!email || !groupId) {
    return res.status(400).json({ success: false, message: 'Email is required.' });
  }

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
app.post('/score-submit', async (req, res) => {
  const d = req.body || {};

  if (!d.email || typeof d.email !== 'string') {
    return res.status(400).json({ success: false, message: 'Email is required.' });
  }

  const name = String(d.name || '').slice(0, 120);
  const email = String(d.email).slice(0, 200);
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
      subject: `Score ${score.score_total}% — ${name || email}${icpMatch ? ' — ICP MATCH' : ''}`,
      html: `
        <div style="font-family: Georgia, serif; max-width: 620px; margin: 0 auto; color: #1a1a1a;">
          <div style="background:#2C4669;padding:24px 32px;">
            <h1 style="color:#fff;margin:0;font-size:20px;letter-spacing:2px;font-family:sans-serif;font-weight:300;">VLADIMIR RICH&Eacute;</h1>
            <p style="color:#FF7924;margin:4px 0 0;font-size:13px;letter-spacing:1px;font-family:sans-serif;">PARTNER WARDROBE SYSTEM SCORE</p>
          </div>
          <div style="padding:32px;background:#f8f7f5;border:1px solid #e8e4de;">
            ${icpMatch ? '<p style="margin:0 0 20px;padding:10px 14px;background:#FF7924;color:#fff;font-family:sans-serif;font-size:13px;letter-spacing:1px;">HARD ICP MATCH</p>' : ''}
            <table style="width:100%;border-collapse:collapse;">
              ${row('Name', name || '&mdash;')}
              ${row('Email', `<a href="mailto:${email}" style="color:#2974B0;">${email}</a>`)}
              ${row('Score', `<strong>${score.score_total}%</strong> &nbsp; ${score.score_tier}`)}
              ${row('Weakest area', score.score_weakest)}
              ${row('Foundation', score.score_foundation + ' / 12')}
              ${row('Fit', score.score_fit + ' / 12')}
              ${row('Decision', score.score_decision + ' / 12')}
              ${row('Acquisition', score.score_acquisition + ' / 12')}
              ${row('Room', score.score_room + ' / 12')}
              ${row('Since promotion', score.promo_window || '&mdash;')}
              ${row('Firm type', score.firm_type || '&mdash;')}
              ${row('Location', score.location || '&mdash;')}
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
      const payload = { email, fields: Object.assign({ name }, score) };
      if (process.env.MAILERLITE_SCORE_GROUP) {
        payload.groups = [process.env.MAILERLITE_SCORE_GROUP];
      }
      const r = await fetch('https://connect.mailerlite.com/api/subscribers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.MAILERLITE_API_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!r.ok) console.error('MailerLite score subscribe failed:', r.status, await r.text());
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
