import { afterEach, expect, it, vi } from 'vitest';
import nodemailer from 'nodemailer';
import { ClientMailer } from './mailer.js';
import { validateEnvironment } from '../../config/environment.js';
vi.mock('nodemailer', () => ({ default: { createTransport: vi.fn() } }));
afterEach(() => vi.resetAllMocks());
const base = { DATABASE_URL: 'postgresql://localhost/unused', JWT_ACCESS_SECRET: 'a'.repeat(32), WEB_ORIGIN: 'https://coaching.example.test', NODE_ENV: 'production' };
it('does not pretend to send when SMTP is not configured', async () => {
  expect(await new ClientMailer(validateEnvironment(base)).send('client@example.test', 'registration', 'private-token')).toEqual({ status: 'not_configured' });
  expect(nodemailer.createTransport).not.toHaveBeenCalled();
});
it('sends private expiring links through SMTP without passwords in the message', async () => {
  const sendMail = vi.fn<(message: { to: string; subject: string; text: string }) => Promise<{ accepted: string[] }>>().mockResolvedValue({ accepted: ['client@example.test'] }), close = vi.fn();
  vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail, close } as unknown as ReturnType<typeof nodemailer.createTransport>);
  const mailer = new ClientMailer(validateEnvironment({ ...base, SMTP_HOST: 'smtp.example.test', MAIL_FROM: 'coach@example.test' }));
  expect(await mailer.send('client@example.test', 'registration', 'private-token')).toEqual({ status: 'sent' });
  expect(sendMail.mock.calls[0]![0]).toMatchObject({ to: 'client@example.test', subject: 'Set up your coaching account' });
  expect(sendMail.mock.calls[0]![0].text).toContain('https://coaching.example.test/register/client#invite=private-token');
  await mailer.send('client@example.test', 'reset', 'reset-token');
  expect(sendMail.mock.calls[1]![0].text).toContain('https://coaching.example.test/reset-password#token=reset-token');
  expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({ requireTLS: true, disableFileAccess: true, disableUrlAccess: true }));
  expect(close).toHaveBeenCalledTimes(2);
});
it('reports delivery failures and releases the transport', async () => {
  const close = vi.fn();
  vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail: vi.fn().mockRejectedValue(new Error('SMTP unavailable')), close } as unknown as ReturnType<typeof nodemailer.createTransport>);
  expect(await new ClientMailer(validateEnvironment({ ...base, SMTP_HOST: 'smtp.example.test', MAIL_FROM: 'coach@example.test' })).send('client@example.test', 'welcome')).toEqual({ status: 'failed' });
  expect(close).toHaveBeenCalled();
});
