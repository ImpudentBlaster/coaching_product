import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from './auth-context';

export function LoginPage() {
  const { login } = useAuth(); const navigate = useNavigate();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); try { const user = await login(email, password); navigate(user.role === 'PLATFORM_ADMIN' ? '/admin' : user.role === 'COACH' ? '/coach' : '/client'); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to sign in'); } finally { setBusy(false); } }
  return <div className="auth-grid"><section><p className="eyebrow">Welcome back</p><h1>Sign in to your coaching workspace.</h1><p className="lede">Manage applications, clients and your business from one focused dashboard.</p></section><form className="card form-card" onSubmit={submit}><h2>Sign in</h2><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{error && <p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button><p className="helper">New coach? <Link to="/register/coach">Create an account</Link></p><p className="helper"><Link to="/reset-password">Use an admin reset code</Link></p></form></div>;
}
