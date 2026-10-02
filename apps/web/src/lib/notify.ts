import { toast } from 'sonner';

type Options = { description?: string; duration?: number; id?: string };
export function notificationMessage(message: string) {
  return /(?:AxiosError|TypeError|SyntaxError|stack trace|SQLSTATE|Request failed|status code|\bECONN[A-Z_]*\b|duplicate key|database constraint|unexpected token|failed to fetch|fetch failed|<html|<!doctype)/i.test(message)
    ? 'Unable to complete this action. Please try again.' : message;
}
// The component owning the user-facing action owns its notification. API helpers
// never emit toasts: this avoids duplicate feedback and keeps load errors inline.
export const notify = {
  success: (message: string, options?: Options) => toast.success(message, { duration: 3500, ...options }),
  error: (message: string, options?: Options) => toast.error(notificationMessage(message), { duration: 6500, ...options }),
  warning: (message: string, options?: Options) => toast.warning(message, { duration: 5000, ...options }),
  info: (message: string, options?: Options) => toast.info(message, { duration: 4000, ...options }),
  dismiss: toast.dismiss,
};
