import React from 'react';
import { LoadingSpinner } from './LoadingSpinner';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  isLoading?: boolean;
  children: React.ReactNode;
}

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  // primary は唯一のアクセント青 (vn-accent #4F46E5)
  primary: 'bg-vn-accent text-white hover:bg-indigo-700 disabled:opacity-50',
  secondary: 'border border-vn-border bg-white text-gray-700 hover:bg-vn-muted-bg disabled:opacity-50',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
};

export function Button({
  variant = 'primary',
  isLoading = false,
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || isLoading}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-vn-accent/40 focus:ring-offset-2',
        variantClasses[variant],
        className,
      ].join(' ')}
      {...props}
    >
      {isLoading ? (
        <>
          <LoadingSpinner size="sm" label="読み込み中" />
          <span className="sr-only">処理中...</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
