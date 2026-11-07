type AuthEmailInput = {
  email: string;
  displayName: string;
  token: string;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}

async function sendBrandedEmail(input: AuthEmailInput, purpose: 'verify' | 'reset'): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const baseUrl = process.env.APP_BASE_URL;
  if (!apiKey || !from || !baseUrl) {
    throw new Error('Email delivery is not configured. Set RESEND_API_KEY, EMAIL_FROM and APP_BASE_URL.');
  }

  const appUrl = new URL(baseUrl);
  if (process.env.NODE_ENV === 'production' && appUrl.protocol !== 'https:') {
    throw new Error('APP_BASE_URL must use HTTPS in production.');
  }
  const path = purpose === 'verify' ? '/verify-email' : '/reset-password';
  const link = new URL(path, appUrl);
  link.searchParams.set('token', input.token);
  const displayName = escapeHtml(input.displayName);
  const isVerification = purpose === 'verify';
  const subject = isVerification ? 'Verify your Geemifi email' : 'Reset your Geemifi password';
  const action = isVerification ? 'Verify email address' : 'Choose a new password';
  const description = isVerification
    ? 'Confirm your email address to finish setting up your Geemifi account.'
    : 'We received a request to reset the password for your Geemifi account.';
  const expiration = isVerification ? 'This link expires in 24 hours.' : 'This link expires in 1 hour.';
  const html = `<div style="font-family:Arial,sans-serif;color:#2c2635;max-width:560px;margin:32px auto;padding:32px;border:1px solid #eee8f0;border-radius:20px"><div style="font-size:24px;font-weight:700;color:#6929dc">Geemifi</div><h1 style="font-size:22px;margin-top:28px">Hi ${displayName},</h1><p style="font-size:15px;line-height:1.6">${description}</p><p style="margin:28px 0"><a href="${escapeHtml(link.toString())}" style="display:inline-block;padding:13px 20px;border-radius:10px;background:#6929dc;color:white;text-decoration:none;font-weight:700">${action}</a></p><p style="font-size:13px;color:#847d8c">${expiration} If you didn't request this, you can ignore this email.</p><p style="font-size:13px;color:#847d8c">Made for people, by people.<br>— The Geemifi team</p></div>`;
  const text = `Hi ${input.displayName},\n\n${description}\n\n${action}: ${link.toString()}\n\n${expiration} If you didn't request this, you can ignore this email.\n\nThe Geemifi team`;

  let response: Response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [input.email], subject, html, text }),
    });
  } catch {
    throw new Error('The email provider could not be reached.');
  }
  if (!response.ok) throw new Error(`The email provider rejected the message (HTTP ${response.status}).`);
}

export function sendVerificationEmail(input: AuthEmailInput): Promise<void> {
  return sendBrandedEmail(input, 'verify');
}

export function sendPasswordResetEmail(input: AuthEmailInput): Promise<void> {
  return sendBrandedEmail(input, 'reset');
}

export type { AuthEmailInput };
