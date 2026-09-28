'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  // 骨白底、深色字：主操作；和 LockAI 的 ink 按钮同一逻辑
  primary:
    'bg-ink text-ink-fg shadow-[inset_0_1px_0_oklch(1_0_0/0.5),0_1px_2px_oklch(0_0_0/0.4),0_8px_20px_-10px_oklch(0.9_0.02_80/0.35)] hover:bg-[oklch(0.985_0.006_82)] active:translate-y-px',
  secondary:
    'bg-surface-2 text-fg border border-line hover:bg-surface-3 hover:border-line-strong shadow-[var(--edge)]',
  ghost: 'text-fg-soft hover:text-fg hover:bg-surface-2',
  danger: 'bg-danger-soft text-danger border border-[oklch(0.71_0.14_27/0.3)] hover:bg-[oklch(0.71_0.14_27/0.2)]',
  accent: 'bg-accent-soft text-accent-ink border border-accent-line hover:bg-[oklch(0.77_0.074_176/0.2)]',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-[9px]',
  md: 'h-10 px-4 text-sm gap-2 rounded-[11px]',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-[13px]',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, trailing, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'group relative inline-flex select-none items-center justify-center font-medium whitespace-nowrap',
        'transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-200 ease-out',
        'disabled:pointer-events-none disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner className="size-4" /> : icon}
      {children && <span className={cn(loading && 'opacity-80')}>{children}</span>}
      {!loading && trailing}
    </button>
  );
});
