import { CompassRose, EmptyState } from "@/shared/ui";

export function NotFoundPage() {
  return (
    <div className="fullscreen-center">
      <EmptyState
        icon={CompassRose}
        title="Page not found"
        description="The page you are looking for doesn't exist or has moved."
        action={
          <a className="btn btn--primary" href="/chat">
            Back to chat
          </a>
        }
      />
    </div>
  );
}

export default NotFoundPage;
