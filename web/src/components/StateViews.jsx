// Shared loading / empty / error blocks so every screen
// shows something meaningful instead of a blank area.

export function LoadingState({ label = "Loading..." }) {
    return (
        <div className="state-box state-loading" role="status" aria-live="polite">
            <span className="state-spinner" aria-hidden="true" />
            {label}
        </div>
    );
}

export function EmptyState({ children, hint }) {
    return (
        <div className="empty">
            {children}
            {hint && <div className="state-hint">{hint}</div>}
        </div>
    );
}

export function ErrorState({ message, onRetry }) {
    return (
        <div className="state-box state-error" role="alert">
            <div>{message || "Something went wrong."}</div>
            {onRetry && (
                <button type="button" className="state-retry" onClick={onRetry}>
                    Try again
                </button>
            )}
        </div>
    );
}
