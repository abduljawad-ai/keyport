export function NotFoundPage() {
  return (
    <div className="fullscreen-center">
      <div className="empty-state">
        <div className="empty-state__icon" aria-hidden="true">🧭</div>
        <div className="empty-state__title">Page not found</div>
        <div className="empty-state__description">
          The page you are looking for doesn't exist or has moved.
        </div>
        <div className="empty-state__action">
          <a className="btn btn--primary" href="/chat">
            Back to chat
          </a>
        </div>
      </div>
    </div>
  );
}

export default NotFoundPage;
