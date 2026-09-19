import { useEffect, useState } from 'react';
import { apiBlob } from '../lib/api';
import { LoadingImage } from './loading-image';

export function ExerciseGif({ id, name, available = true }: { id: string; name: string; available?: boolean }) {
  return <ExerciseAnimation key={`${id}-${available}`} id={id} name={name} available={available} />;
}
function ExerciseAnimation({ id, name, available }: { id: string; name: string; available: boolean }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true, objectUrl = '';
    setFailed(false); setUrl('');
    void apiBlob(`/exercises/${encodeURIComponent(id)}/gif`).then(blob => {
      if (active) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, available, retry]);
  return <div className="exercise-media">{failed
    ? <div><span>{available ? 'Animation could not load' : 'No animation available'}</span><button className="secondary small" type="button" onClick={() => setRetry(value => value + 1)} aria-label={`Retry animation for ${name}`}>Retry animation</button></div>
    : <LoadingImage src={url} alt={`${name} demonstration`} onError={() => setFailed(true)} />}</div>;
}
