import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest } from '../../lib/api';

export function PasswordResetPage() {
  const navigate = useNavigate(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError(''); try { await apiRequest('/auth/password-reset', { method: 'POST', body: JSON.stringify({ token: data.get('token'), newPassword: data.get('newPassword') }) }); navigate('/login'); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to reset password'); } finally { setBusy(false); } }
  return <div className="auth-grid"><section><p className="eyebrow">Account recovery</p><h1>Set a new password.</h1><p className="lede">Enter the one-time reset code supplied by the platform administrator. Codes expire after 30 minutes.</p></section><form className="card form-card" onSubmit={submit}><h2>Reset password</h2><label>Reset code<input name="token" required /></label><label>New password<input name="newPassword" type="password" minLength={12} required /></label>{error && <p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button><p className="helper"><Link to="/login">Back to sign in</Link></p></form></div>;
}
