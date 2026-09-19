/**
 * Inline status banner.
 *
 * `tone` selects the colour; `role` is set so assistive technology announces
 * errors immediately and other messages politely.
 */
export function StatusMessage({ tone = 'info', title, children, onRetry }) {
  const isError = tone === 'error'

  return (
    <div className={`status status--${tone}`} role={isError ? 'alert' : 'status'}>
      {title && <strong className="status__title">{title}</strong>}
      <div className="status__body">{children}</div>
      {onRetry && (
        <button type="button" className="button button--ghost" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

export function Spinner({ label = 'Loading' }) {
  return (
    <div className="spinner" role="status" aria-live="polite">
      <span className="spinner__dot" aria-hidden="true" />
      <span className="spinner__label">{label}…</span>
    </div>
  )
}

export function EmptyState({ title, children }) {
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      {children && <p className="empty__body">{children}</p>}
    </div>
  )
}
