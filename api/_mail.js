// Sends TaniNote's account emails through Gmail (SMTP with an app password).
// Set GMAIL_USER and GMAIL_APP_PASSWORD in the Vercel project's environment variables.
import nodemailer from 'nodemailer';

let transport;
export const mailReady = () => !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);

export async function sendMail({ to, subject, text, html }) {
  if (!mailReady()) throw new Error('mail not configured');
  transport = transport || nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD.replace(/\s+/g, '') },
  });
  await transport.sendMail({ from: `TaniNote <${process.env.GMAIL_USER}>`, to, subject, text, html });
}

export function resetEmail(link) {
  const text = `Someone asked to reset the password for your TaniNote account.

Open this link to choose a new password. It works once and expires in 30 minutes:
${link}

If you didn't ask for this, ignore this email. Your password stays the same.`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f1e8;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#262b4a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;padding:32px">
<tr><td style="font-size:22px;font-weight:700;padding-bottom:12px">Reset your TaniNote password</td></tr>
<tr><td style="font-size:16px;line-height:1.5;padding-bottom:24px">Someone asked to reset the password for your TaniNote account. Tap the button to choose a new one. The link works once and expires in 30 minutes.</td></tr>
<tr><td style="padding-bottom:24px"><a href="${link}" style="display:inline-block;background:#262b4a;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 22px;border-radius:12px">Choose a new password</a></td></tr>
<tr><td style="font-size:14px;line-height:1.5;color:#6b6f86">If you didn't ask for this, ignore this email. Your password stays the same.</td></tr>
</table></td></tr></table></body></html>`;
  return { text, html };
}
