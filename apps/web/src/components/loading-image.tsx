import { useState } from 'react';
import './loading-image.css';

export function ImagePlaceholder({ label = 'Loading image', loading = true }: { label?: string; loading?: boolean }) {
  return <div className={`image-placeholder${loading ? ' is-loading' : ''}`} role={loading ? 'status' : 'img'} aria-label={label}>
    <svg aria-hidden="true" viewBox="0 0 32 32" fill="none"><rect x="4" y="5" width="24" height="22" rx="3" /><circle cx="11" cy="12" r="2" /><path d="m5 23 7-7 5 5 4-4 7 7" /></svg>
  </div>;
}

type Props = { src?: string; alt: string; className?: string; onError?: () => void; loading?: 'lazy' | 'eager' };
export function LoadingImage(props: Props) {
  return <ImageContent key={props.src ?? 'pending'} {...props} />;
}
function ImageContent({ src, alt, className = '', onError, loading = 'lazy' }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return <div className={`loading-image ${className}`}>
    {(!loaded || failed) && <ImagePlaceholder loading={!failed} label={failed ? `${alt} unavailable` : `Loading ${alt}`} />}
    {src && <img src={src} alt={alt} loading={loading} style={{ visibility: loaded && !failed ? 'visible' : 'hidden' }} onLoad={() => setLoaded(true)} onError={() => { setFailed(true); onError?.(); }} />}
  </div>;
}
