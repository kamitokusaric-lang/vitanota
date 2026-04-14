interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
};

export function LoadingSpinner({ size = 'md', label = '読み込み中' }: LoadingSpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={[
        'inline-block animate-spin rounded-full border-2 border-current border-t-transparent',
        sizeClasses[size],
      ].join(' ')}
    />
  );
}
