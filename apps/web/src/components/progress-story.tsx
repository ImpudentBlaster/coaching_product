type Entry = Record<string, unknown>;

/** A presentation of recorded measurements, without inferred goals or scores. */
export function ProgressStory({ entries }: { entries: Entry[] }) {
  const points = entries
    .filter(entry => entry.body_weight !== null && entry.body_weight !== undefined && entry.body_weight !== '' && Number.isFinite(Number(entry.body_weight)))
    .map(entry => ({ date: String(entry.measurement_date).slice(0, 10), value: Number(entry.body_weight) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = points.at(-1);
  const first = points[0];
  const low = Math.min(...points.map(point => point.value));
  const high = Math.max(...points.map(point => point.value));
  const change = latest && first ? latest.value - first.value : 0;
  return <article className="card progress-story">
    <div className="progress-story-copy"><p className="eyebrow">Your progress, in perspective</p>
      <h2>{latest ? 'Every entry tells a story.' : 'Your starting point matters.'}</h2>
      {latest ? <><div className="hero-measurement"><strong>{latest.value}</strong><span>kg · latest weight</span></div><p>Recorded {latest.date}{points.length > 1 ? ` · ${change > 0 ? '+' : ''}${Number(change.toFixed(2))} kg since ${first?.date}` : ''}</p></> : <p>Add your first measurement below. Over time, your entries will build a picture of your journey.</p>}
    </div>
    <div className="progress-story-chart">{points.length > 1 ? <figure>
      <svg viewBox="0 0 600 200" role="img" aria-label={`Recorded weight from ${first?.value} to ${latest?.value} kilograms, ${first?.date} to ${latest?.date}. Range ${low} to ${high} kilograms.`}>
        {[35, 100, 165].map(y => <line key={y} x1="20" x2="580" y1={y} y2={y} className="trend-guide" />)}
        <polyline fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" points={points.map((point, index) => `${20 + index * 560 / (points.length - 1)},${165 - (point.value - low) * 130 / (high - low || 1)}`).join(' ')} />
        {points.map((point, index) => <circle key={`${point.date}-${index}`} cx={20 + index * 560 / (points.length - 1)} cy={165 - (point.value - low) * 130 / (high - low || 1)} r="4" fill="currentColor"><title>{point.date}: {point.value} kg</title></circle>)}
      </svg><figcaption>{points.length} recorded measurements · {low}–{high} kg<br />Entries shown in date order; spacing represents entries, not elapsed time.</figcaption>
    </figure> : <div className="progress-placeholder"><span className="track-emblem" aria-hidden="true" /><p>{latest ? 'Your next entry begins the trend.' : 'One entry. A place to begin.'}</p><small>A weight trend appears after two measurements.</small></div>}</div>
  </article>;
}
