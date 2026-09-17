import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiRequest, type User } from '../../lib/api';
import { useAuth } from './auth-context';

export function ClientRegisterPage() {
  const { login, ready } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('invite') ?? '';
  const [invitation, setInvitation] = useState<{
    email: string;
    displayName: string;
  } | null>(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setInvitation(null);
    setError('');
    setComplete(false);
    setName('');
    if (!token) {
      setError('This registration link is missing its invitation code.');
      setLoading(false);
      return;
    }
    void apiRequest<{ invitation: { email: string; displayName: string } }>(
      '/auth/client/invitation',
      { method: 'POST', body: JSON.stringify({ token }) },
    )
      .then((result) => {
        if (current) {
          setInvitation(result.invitation);
          setName(result.invitation.displayName);
        }
      })
      .catch((caught) => {
        if (current)
          setError(
            caught instanceof Error
              ? caught.message
              : 'Unable to load your invitation.',
          );
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [token, attempt]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !ready || !invitation) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const password = String(fields.get('password') ?? '');
    setBusy(true);
    setError('');
    try {
      const result = await apiRequest<{ user: User }>('/auth/client/register', {
        method: 'POST',
        body: JSON.stringify({ token, displayName: name.trim(), password }),
      });
      form.reset();
      setComplete(true);
      try {
        await login(result.user.email, password);
        navigate('/client', { replace: true });
      } catch {
        setError(
          'Your account was created, but automatic sign-in did not finish. Sign in with your email and the password you just chose.',
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to register');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-grid">
      <section>
        <p className="eyebrow">Client invitation</p>
        <h1>Join your coach’s workspace.</h1>
        <p className="lede">
          Choose a password to finish setting up your account. We’ll sign you in
          when you’re done.
        </p>
      </section>
      {complete ? (
        <section className="card form-card">
          <h2>Your account is ready</h2>
          {busy ? (
            <p role="status">Signing you in…</p>
          ) : (
            <>
              <p className="error" role="alert">
                {error}
              </p>
              <p>Use {invitation?.email} to sign in.</p>
              <Link className="primary link-button" to="/login">
                Continue to sign in
              </Link>
            </>
          )}
        </section>
      ) : (
        <form className="card form-card" onSubmit={submit}>
          <h2>Finish your account setup</h2>
          {loading && <p role="status">Loading your invitation…</p>}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {!loading && invitation && (
            <>
              {invitation.displayName ? (
                <p>
                  Welcome, <strong>{invitation.displayName}</strong>.
                </p>
              ) : (
                <label>
                  Your name
                  <input
                    name="displayName"
                    autoComplete="name"
                    minLength={2}
                    maxLength={100}
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
              )}
              <label>
                Email
                <input
                  type="email"
                  name="email"
                  autoComplete="username"
                  readOnly
                  value={invitation.email}
                />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  aria-describedby="password-help"
                  minLength={12}
                  maxLength={128}
                  required
                />
              </label>
              <small id="password-help">
                At least 12 characters. Set your own password.
              </small>
              <p className="helper">
                Your coach will approve access to your coaching plan.
              </p>
              <button className="primary" disabled={busy || !ready}>
                {busy ? 'Creating…' : 'Create account and continue'}
              </button>
            </>
          )}
          {!loading && !invitation && token && (
            <button
              type="button"
              className="secondary"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Check link again
            </button>
          )}
          <p className="helper">
            Already registered? <Link to="/login">Sign in</Link>
          </p>
        </form>
      )}
    </div>
  );
}
