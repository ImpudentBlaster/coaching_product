import nodemailer from 'nodemailer';
import type { Environment } from '../../config/environment.js';

export type Delivery = { status: 'sent' | 'not_configured' | 'failed' };
export class ClientMailer {
  constructor(private readonly environment: Environment) {}
  async send(to: string, kind: 'registration' | 'reset' | 'welcome', token?: string): Promise<Delivery> {
    const env = this.environment;
    if (!env.SMTP_HOST || !env.MAIL_FROM) return { status: 'not_configured' };
    const url = new URL(kind === 'registration' ? '/register/client' : kind === 'reset' ? '/reset-password' : '/login', env.WEB_ORIGIN);
    if (token) url.hash = new URLSearchParams({ [kind === 'registration' ? 'invite' : 'token']: token }).toString();
    const subject = kind === 'reset' ? 'Reset your coaching account password' : kind === 'registration' ? 'Set up your coaching account' : 'Your coaching account is registered';
    const text = kind === 'reset' ? `Your coach requested a password reset. Set a new password using this single-use link within 30 minutes:\n${url.href}\nIf you did not expect this request, contact your coach.` : kind === 'registration' ? `Your coach has invited you to join. Set up your profile and choose your own password using this single-use link within seven days:\n${url.href}` : `Your coaching account is already registered. Sign in using your existing password:\n${url.href}\nIf you need a new password, ask your coach to send a password reset link.`;
    const transport = nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT ?? 587, secure: env.SMTP_SECURE ?? false, requireTLS: env.NODE_ENV === 'production' && !env.SMTP_SECURE, auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined, connectionTimeout: 10000, socketTimeout: 15000, disableFileAccess: true, disableUrlAccess: true });
    try {
      const result = await transport.sendMail({ from: env.MAIL_FROM, to, subject, text });
      return { status: result.accepted.length ? 'sent' : 'failed' };
    } catch { return { status: 'failed' }; }
    finally { transport.close(); }
  }
}
