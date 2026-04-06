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
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.hostinger.com',
      port: parseInt(process.env.SMTP_PORT) || 465,
      secure: true,
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

// Catch-all: serve index.html for any unmatched route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
