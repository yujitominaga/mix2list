interface Props {
  message: string;
  show: boolean;
  loading?: boolean;
  ready?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}

export function Snackbar({ message, show, loading, ready, actionLabel, onAction }: Props) {
  return (
    <div className={`snackbar${show ? " show" : ""}${ready ? " ready" : ""}`} role="status" aria-live="polite">
      <span className="snackbar-accent" />
      {loading && <span className="spinner" aria-hidden />}
      <span className="snackbar-msg">{message}</span>
      {actionLabel && onAction && (
        <button className="snackbar-action" onClick={onAction}>{actionLabel}</button>
      )}
    </div>
  );
}
