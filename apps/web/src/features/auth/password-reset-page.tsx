import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest } from '../../lib/api';
import { useAuth } from './auth-context';

export function PasswordResetPage() {
  const { logout } = useAuth();
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? new URLSearchParams(window.location.search).get('token') ?? '';
  const navigate = useNavigate(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError(''); try { await apiRequest('/auth/password-reset', { method: 'POST', body: JSON.stringify({ token: data.get('token'), newPassword: data.get('newPassword') }) }); await logout(); navigate('/login', { replace: true }); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to reset password'); } finally { setBusy(false); } }
  return <div className="auth-grid"><section><p className="eyebrow">Account recovery</p><h1>Set a new password.</h1><p className="lede">Choose your new password. The one-time link expires after 30 minutes.</p></section><form className="card form-card" onSubmit={submit}><h2>Reset password</h2>{token ? <input type="hidden" name="token" value={token} /> : <label>Reset code<input name="token" required /></label>}<label>New password<input name="newPassword" type="password" minLength={12} maxLength={128} required /></label>{error && <p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button><p className="helper"><Link to="/login">Back to sign in</Link></p></form></div>;
}
