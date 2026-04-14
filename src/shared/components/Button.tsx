import React from 'react';
import { LoadingSpinner } from './LoadingSpinner';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  isLoading?: boolean;
  children: React.ReactNode;
}

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300',
  secondary: 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50',
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
        'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
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
