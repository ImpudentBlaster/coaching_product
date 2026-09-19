import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { apiBlob, apiRequest } from '../../lib/api';
import { useAuth } from '../auth/auth-context';
import './feed.css';

type Attachment = { id: string; name: string; mediaType: string; size: number };
type Post = { id: string; body: string; authorName: string; isCoach: boolean; createdAt: string; canDelete: boolean; attachments: Attachment[]; liked: boolean; likeCount: number; commentCount: number };
type Comment = { id: string; body: string; authorName: string; createdAt: string; canDelete: boolean };
type Page<T> = { items: T[]; nextCursor: string | null };
type Filter = 'all' | 'mine' | 'photos' | 'files';
const filters: { value: Filter; label: string }[] = [{ value: 'all', label: 'All posts' }, { value: 'photos', label: 'Photos' }, { value: 'files', label: 'Files' }, { value: 'mine', label: 'My posts' }];
const message = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';
const formatSize = (size: number) => size < 1024 * 1024 ? `${Math.ceil(size / 1024)} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;
function timestamp(value: string) { return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
function encode(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Unable to read ${file.name}.`));
    reader.onload = () => resolve(String(reader.result).split(',')[1]!);
    reader.readAsDataURL(file);
  });
}

export function CommunityFeed() {
  const { user, ready } = useAuth();
  if (!ready) return <p role="status">Loading your community…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.approvalStatus !== 'APPROVED' || !['COACH', 'CLIENT'].includes(user.role)) return <section className="card status-page"><h1>Community feed</h1><p>An approved coach or client account is required.</p></section>;
  return <Feed key={user.id} name={user.displayName} />;
}

function Feed({ name }: { name: string }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [community, setCommunity] = useState('Your coaching community');
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    setLoading(true); setError(''); setPosts([]); setCursor(null);
    void apiRequest<Page<Post> & { community: string }>(`/feed/posts?filter=${filter}`).then(result => {
      if (generation.current === current) { setPosts(result.items); setCursor(result.nextCursor); setCommunity(result.community); }
    }).catch(error => { if (generation.current === current) setError(message(error)); }).finally(() => { if (generation.current === current) setLoading(false); });
    return () => { generation.current = current + 1; };
  }, [filter, revision]);
  async function loadMore() {
    const current = generation.current;
    setLoading(true); setError('');
    try {
      const result = await apiRequest<Page<Post>>(`/feed/posts?filter=${filter}&before=${cursor}`);
      if (generation.current === current) { setPosts(previous => [...previous, ...result.items.filter(item => !previous.some(post => post.id === item.id))]); setCursor(result.nextCursor); }
    } catch (error) { if (generation.current === current) setError(message(error)); }
    finally { if (generation.current === current) setLoading(false); }
  }
  return <section className="community-feed">
    <header className="dashboard-head"><div><p className="eyebrow">Better together</p><h1>Community feed<span>.</span></h1><p className="feed-subtitle">Share the work. Celebrate the wins. Keep each other going.</p></div><button className="secondary" disabled={loading} onClick={() => setRevision(value => value + 1)}>Refresh</button></header>
    <div className="feed-layout"><div className="feed-main">
      <Composer name={name} onPosted={() => { setFilter('all'); setRevision(value => value + 1); }} />
      <nav className="feed-filters" aria-label="Filter community posts">{filters.map(item => <button key={item.value} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}</button>)}</nav>
      {error && <div className="error" role="alert">{error} <button onClick={() => setRevision(value => value + 1)}>Try again</button></div>}
      {loading && <p role="status" className="feed-loading">Loading posts…</p>}
      {!loading && !error && posts.length === 0 && <div className="card feed-empty"><span aria-hidden="true">✦</span><h2>{filter === 'all' ? 'Every community starts with a hello.' : 'No posts here yet.'}</h2><p>{filter === 'all' ? 'Share a win, ask a question, or add a useful resource for your community.' : 'Try another filter or share something above.'}</p></div>}
      {posts.map(post => <PostCard key={post.id} post={post} onChange={updated => setPosts(previous => previous.map(item => item.id === updated.id ? updated : item))} onDelete={() => setPosts(previous => previous.filter(item => item.id !== post.id))} />)}
      {cursor && <button className="secondary feed-load-more" disabled={loading} onClick={() => void loadMore()}>Load more posts</button>}
    </div><aside className="feed-sidebar"><div className="feed-community-card"><span className="feed-community-icon" aria-hidden="true">✦</span><p className="eyebrow">Your community</p><h2>{community}</h2><p>A little encouragement goes a long way.</p><span className="feed-private-label">Private coaching community</span></div><div className="card feed-guidelines"><h3>A space to grow</h3><p>Share training wins, questions, photos, and resources.</p><p>Posts are visible to your coach and their approved clients. Only share information you want the whole community to see.</p><p>Keep it supportive. Your coach can remove posts and comments.</p></div></aside></div>
  </section>;
}

function Composer({ name, onPosted }: { name: string; onPosted: () => void }) {
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const photoInput = useRef<HTMLInputElement>(null), fileInput = useRef<HTMLInputElement>(null);
  function addFiles(input: FileList | null) {
    const selected = [...files, ...Array.from(input ?? [])];
    setError(''); setStatus('');
    if (selected.length > 4 || selected.some(file => !file.size || file.size > 10 * 1024 * 1024) || selected.reduce((sum, file) => sum + file.size, 0) > 20 * 1024 * 1024) { setError('Choose up to 4 non-empty files, 10 MB each and 20 MB total.'); return; }
    if (selected.some(file => /image\/(jpeg|png|webp)/.test(file.type) && file.size > 8 * 1024 * 1024)) { setError('Photos must be 8 MB or smaller.'); return; }
    setFiles(selected);
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setStatus('');
    try {
      const attachments = await Promise.all(files.map(async file => ({ name: file.name, image: /^image\/(jpeg|png|webp)$/.test(file.type), data: await encode(file) })));
      await apiRequest('/feed/posts', { method: 'POST', body: JSON.stringify({ body, attachments }) });
      setBody(''); setFiles([]); setStatus('Your post was shared with the community.'); onPosted();
    } catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }
  return <form className="card feed-composer" onSubmit={event => void submit(event)}>
    <div className="feed-person"><div className="avatar">{name.charAt(0).toUpperCase()}</div><div><strong>{name}</strong><small>Sharing with your coach and their approved clients</small></div></div>
    <label className="feed-compose-label"><span className="sr-only">Write a community post</span><textarea value={body} onChange={event => setBody(event.target.value)} disabled={busy} maxLength={5000} placeholder="What’s happening in your fitness journey?" rows={3} /></label>
    {files.length > 0 && <ul className="feed-pending-files">{files.map((file, index) => <li key={`${file.name}-${index}`}><DraftFile file={file} /><span>{file.name}<small>{formatSize(file.size)}</small></span><button type="button" disabled={busy} aria-label={`Remove ${file.name}`} onClick={() => setFiles(previous => previous.filter((_, position) => position !== index))}>×</button></li>)}</ul>}
    {error && <p className="error" role="alert">{error}</p>}{status && <p className="feed-success" role="status">{status}</p>}
    <div className="feed-compose-actions"><div><input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={event => { addFiles(event.target.files); event.target.value = ''; }} /><input ref={fileInput} type="file" multiple hidden onChange={event => { addFiles(event.target.files); event.target.value = ''; }} /><button type="button" disabled={busy} onClick={() => photoInput.current?.click()}><span aria-hidden="true">▧</span> Photo</button><button type="button" disabled={busy} onClick={() => fileInput.current?.click()}><span aria-hidden="true">＋</span> File</button></div><small>{body.length}/5,000</small><button type="submit" className="primary" disabled={busy || (!body.trim() && files.length === 0)}>{busy ? 'Sharing…' : 'Share post'}</button></div>
    <p className="feed-limits">Up to 4 attachments · Photos 8 MB · Files 10 MB · 20 MB total</p>
  </form>;
}
function DraftFile({ file }: { file: File }) {
  const [url, setUrl] = useState('');
  useEffect(() => { if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return; const next = URL.createObjectURL(file); setUrl(next); return () => URL.revokeObjectURL(next); }, [file]);
  return url ? <img src={url} alt="Selected attachment preview" /> : <span aria-hidden="true">▤</span>;
}

function PrivateAttachment({ postId, attachment }: { postId: string; attachment: Attachment }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const image = attachment.mediaType === 'image/jpeg';
  const path = `/feed/posts/${postId}/attachments/${attachment.id}`;
  useEffect(() => {
    if (!image) return;
    let active = true, objectUrl = '';
    setError('');
    void apiBlob(path).then(blob => { if (active) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); } }).catch(error => { if (active) setError(message(error)); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [image, path, retry]);
  async function download() {
    setBusy(true); setError('');
    try {
      const blob = await apiBlob(path), objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = objectUrl; link.download = attachment.name; link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) { setError(message(error)); } finally { setBusy(false); }
  }
  return <div className={image ? 'feed-photo' : 'feed-file'}>
    {image && (url ? <img src={url} alt={attachment.name} loading="lazy" /> : !error && <p role="status">Loading photo…</p>)}
    <button type="button" disabled={busy} onClick={() => void download()} aria-label={`Download ${attachment.name}`}><span aria-hidden="true">↓</span><span>{attachment.name}<small>{formatSize(attachment.size)} · {busy ? 'Downloading…' : 'Download'}</small></span></button>
    {error && <p className="error" role="alert">{error} {image && <button onClick={() => setRetry(value => value + 1)}>Retry photo</button>}</p>}
  </div>;
}

function PostCard({ post, onChange, onDelete }: { post: Post; onChange: (post: Post) => void; onDelete: () => void }) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function like() {
    setBusy(true); setError('');
    try { await apiRequest(`/feed/posts/${post.id}/like`, { method: 'PUT', body: JSON.stringify({ liked: !post.liked }) }); onChange({ ...post, liked: !post.liked, likeCount: post.likeCount + (post.liked ? -1 : 1) }); }
    catch (error) { setError(message(error)); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError('');
    try { await apiRequest(`/feed/posts/${post.id}`, { method: 'DELETE' }); onDelete(); }
    catch (error) { setError(message(error)); } finally { setBusy(false); }
  }
  return <article className="card feed-post">
    <header className="feed-person"><div className="avatar">{post.authorName.charAt(0).toUpperCase()}</div><div><strong>{post.authorName} {post.isCoach && <span className="feed-coach-badge">Coach</span>}</strong><time dateTime={post.createdAt}>{timestamp(post.createdAt)}</time></div>{post.canDelete && <button className="feed-delete" onClick={() => setConfirmDelete(true)} aria-label={`Delete post by ${post.authorName}`}>Remove</button>}</header>
    {post.body && <p className="feed-post-body">{post.body}</p>}
    {post.attachments.length > 0 && <div className="feed-attachments">{post.attachments.map(attachment => <PrivateAttachment key={attachment.id} attachment={attachment} postId={post.id} />)}</div>}
    {confirmDelete && <div className="feed-confirm"><p>Remove this post, its attachments, and all comments?</p><button disabled={busy} className="secondary" onClick={() => setConfirmDelete(false)}>Keep post</button><button disabled={busy} className="secondary" onClick={() => void remove()}>Delete post</button></div>}
    {error && <p className="error" role="alert">{error}</p>}
    <footer className="feed-post-actions"><button disabled={busy} aria-pressed={post.liked} onClick={() => void like()}><span aria-hidden="true">{post.liked ? '♥' : '♡'}</span> {post.likeCount} {post.likeCount === 1 ? 'like' : 'likes'}</button><button aria-expanded={commentsOpen} onClick={() => setCommentsOpen(value => !value)}><span aria-hidden="true">☏</span> {post.commentCount} {post.commentCount === 1 ? 'comment' : 'comments'}</button></footer>
    {commentsOpen && <Comments postId={post.id} onCountChange={delta => onChange({ ...post, commentCount: post.commentCount + delta })} />}
  </article>;
}

function Comments({ postId, onCountChange }: { postId: string; onCountChange: (delta: number) => void }) {
  const [items, setItems] = useState<Comment[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const path = `/feed/posts/${postId}/comments`;
  useEffect(() => {
    let active = true; setBusy(true); setError('');
    void apiRequest<Page<Comment>>(path).then(result => { if (active) { setItems(result.items); setCursor(result.nextCursor); } }).catch(error => { if (active) setError(message(error)); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [path, revision]);
  async function more() {
    setBusy(true); setError('');
    try { const result = await apiRequest<Page<Comment>>(`${path}?before=${cursor}`); setItems(previous => [...previous, ...result.items]); setCursor(result.nextCursor); }
    catch (error) { setError(message(error)); } finally { setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await apiRequest(path, { method: 'POST', body: JSON.stringify({ body }) }); setBody(''); onCountChange(1); setRevision(value => value + 1); }
    catch (error) { setError(message(error)); } finally { setBusy(false); }
  }
  async function remove(id: string) {
    setBusy(true); setError('');
    try { await apiRequest(`${path}/${id}`, { method: 'DELETE' }); setItems(previous => previous.filter(item => item.id !== id)); setConfirmId(null); onCountChange(-1); }
    catch (error) { setError(message(error)); } finally { setBusy(false); }
  }
  return <section className="feed-comments" aria-label="Post comments"><form onSubmit={event => void submit(event)}><label><span className="sr-only">Write a comment</span><textarea placeholder="Add some encouragement…" maxLength={2000} value={body} disabled={busy} onChange={event => setBody(event.target.value)} /></label><button className="primary" disabled={busy || !body.trim()}>Comment</button></form>
    {error && <p role="alert" className="error">{error} <button onClick={() => setRevision(value => value + 1)}>Reload comments</button></p>}
    {busy && <p role="status">Updating comments…</p>}
    {!busy && !error && !items.length && <p className="feed-muted">Be the first to encourage them.</p>}
    {items.map(item => <div className="feed-comment" key={item.id}><strong>{item.authorName}</strong><time dateTime={item.createdAt}>{timestamp(item.createdAt)}</time><p>{item.body}</p>{item.canDelete && (confirmId === item.id ? <div><button disabled={busy} onClick={() => void remove(item.id)}>Delete comment</button><button onClick={() => setConfirmId(null)}>Cancel</button></div> : <button disabled={busy} onClick={() => setConfirmId(item.id)}>Remove comment</button>)}</div>)}
    {cursor && <button disabled={busy} className="secondary" onClick={() => void more()}>Older comments</button>}
  </section>;
}
