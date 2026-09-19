export function LoadingPanel({ label }: { label: string }) {
  return <div className="loading-panel" role="status" aria-live="polite">
    <span>{label}</span>
    <div className="loading-panel-lines" aria-hidden="true">
      <div className="skeleton" /><div className="skeleton" /><div className="skeleton" />
    </div>
  </div>;
}
