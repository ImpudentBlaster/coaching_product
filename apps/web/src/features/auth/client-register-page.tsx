import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../../lib/api';

export function ClientRegisterPage() {
  const [params] = useSearchParams(); const navigate = useNavigate(); const token = params.get('invite') ?? '';
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError(''); try { await apiRequest('/auth/client/register', { method: 'POST', body: JSON.stringify({ token, displayName: data.get('displayName'), password: data.get('password') }) }); navigate('/login'); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to register'); } finally { setBusy(false); } }
  return <div className="auth-grid"><section><p className="eyebrow">Client invitation</p><h1>Join your coach’s workspace.</h1><p className="lede">Create your client account using the private invitation your coach shared with you.</p></section><form className="card form-card" onSubmit={submit}><h2>Create client account</h2>{!token && <p className="error">This registration link is missing its invitation code.</p>}<label>Your name<input name="displayName" minLength={2} required /></label><label>Password<input name="password" type="password" minLength={12} required /><small>At least 12 characters</small></label>{error && <p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy || !token}>{busy ? 'Creating…' : 'Create account'}</button><p className="helper">Already registered? <Link to="/login">Sign in</Link></p></form></div>;
}
