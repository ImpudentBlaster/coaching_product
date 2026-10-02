import { useEffect, useState } from 'react';
import { apiBlob } from '../lib/api';
import { ImagePlaceholder, LoadingImage } from './loading-image';

export function ExerciseGif({ id, name, available = true }: { id: string; name: string; available?: boolean }) {
  return <ExerciseAnimation key={`${id}-${available}`} id={id} name={name} available={available} />;
}
function ExerciseAnimation({ id, name, available }: { id: string; name: string; available: boolean }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true, objectUrl = '';
    setFailed(false); setUrl('');
    void apiBlob(`/exercises/${encodeURIComponent(id)}/gif`).then(blob => {
      if (active) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, available]);
  return <div className="exercise-media">{failed
    ? <div className="loading-image"><ImagePlaceholder loading={false} label={`${name} demonstration unavailable`} /></div>
    : <LoadingImage src={url} alt={`${name} demonstration`} onError={() => setFailed(true)} />}</div>;
}
