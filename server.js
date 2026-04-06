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

// Catch-all: serve index.html for any unmatched route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
