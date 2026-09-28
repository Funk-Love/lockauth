'use client';

import { forwardRef, useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/cn';

interface FieldShellProps {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  aside?: React.ReactNode;
  htmlFor: string;
  children: React.ReactNode;
  className?: string;
}

export function FieldShell({ label, hint, error, aside, htmlFor, children, className }: FieldShellProps) {
  return (
    <div className={cn('space-y-2 pb-2.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-[13px] font-medium tracking-wide text-fg-soft">
          {label}
        </label>
        {aside}
      </div>
      {children}
      <div className="min-h-[18px] text-[12.5px] leading-[18px]" aria-live="polite">
        {error ? (
          <p id={`${htmlFor}-error`} className="text-danger animate-fade">
            {error}
          </p>
        ) : hint ? (
          <div className="text-fg-faint">{hint}</div>
        ) : null}
      </div>
    </div>
  );
}

export const inputClass = (invalid?: boolean) =>
  cn(
    'h-12 w-full rounded-[12px] border bg-[oklch(0.14_0.005_62/0.7)] px-4 text-[15px] text-fg placeholder:text-fg-ghost',
    'shadow-[inset_0_1px_2px_oklch(0_0_0/0.35)] outline-none transition-[border-color,box-shadow,background-color] duration-200',
    'focus:bg-[oklch(0.15_0.006_62/0.9)]',
    invalid
      ? 'border-[oklch(0.71_0.14_27/0.55)] focus:shadow-[0_0_0_3px_var(--danger-soft)]'
      : 'border-line hover:border-line-strong focus:border-accent-line focus:shadow-[0_0_0_3px_var(--accent-soft)]',
  );

export interface TextFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  aside?: React.ReactNode;
  trailing?: React.ReactNode;
  wrapperClassName?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, aside, trailing, wrapperClassName, className, id, ...rest },
  ref,
) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <FieldShell label={label} hint={hint} error={error} aside={aside} htmlFor={fieldId} className={wrapperClassName}>
      <div className="relative">
        <input
          ref={ref}
          id={fieldId}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          className={cn(inputClass(!!error), trailing && !className?.includes('pr-') ? 'pr-12' : undefined, className)}
          {...rest}
        />
        {trailing && <div className="absolute inset-y-0 right-1.5 flex items-center">{trailing}</div>}
      </div>
    </FieldShell>
  );
});

export const PasswordField = forwardRef<HTMLInputElement, Omit<TextFieldProps, 'type' | 'trailing'>>(
  function PasswordField(props, ref) {
    const [shown, setShown] = useState(false);
    return (
      <TextField
        ref={ref}
        type={shown ? 'text' : 'password'}
        spellCheck={false}
        autoCapitalize="off"
        trailing={
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            className="flex size-9 items-center justify-center rounded-[9px] text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg"
            aria-label={shown ? '隐藏密码' : '显示密码'}
            tabIndex={-1}
          >
            {shown ? <EyeOff className="size-[17px]" /> : <Eye className="size-[17px]" />}
          </button>
        }
        {...props}
      />
    );
  },
);

/** 密码强度：四格细条，只提示不拦 */
export function StrengthMeter({ score }: { score: number }) {
  const labels = ['', '弱', '中', '强'];
  return (
    <span className="flex items-center gap-2">
      <span className="flex gap-1">
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              'h-[3px] w-5 rounded-full transition-colors duration-300',
              score >= i ? (score === 1 ? 'bg-warn' : 'bg-accent') : 'bg-line',
            )}
          />
        ))}
      </span>
      <span className="text-fg-faint">{labels[score]}</span>
    </span>
  );
}
