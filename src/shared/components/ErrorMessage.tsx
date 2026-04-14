import { Button } from './Button';

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorMessage({ message, onRetry }: ErrorMessageProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="mt-0.5 h-4 w-4 shrink-0"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
          clipRule="evenodd"
        />
      </svg>
      <div className="flex-1">
        <p>{message}</p>
        {onRetry && (
          <Button
            variant="secondary"
            onClick={onRetry}
            className="mt-2 text-xs"
            data-testid="error-retry-button"
          >
            再試行
          </Button>
        )}
      </div>
    </div>
  );
}
