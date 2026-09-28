'use client';

import { useRef, useState } from 'react';
import { cn } from '@/lib/cn';

interface CodeInputProps {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  onKeystroke?: () => void;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  autoFocus?: boolean;
}

/**
 * 六位验证码：看起来是六个格子，实际是一个输入框（粘贴、短信自动填充、读屏都正常）。
 * 两道细竖线的光标只在当前格子里闪。
 */
export function CodeInput({ value, onChange, onComplete, onKeystroke, disabled, invalid, id, autoFocus }: CodeInputProps) {
  const input = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const digits = value.padEnd(6, ' ').slice(0, 6).split('');
  const active = Math.min(value.length, 5);

  return (
    <div className="relative" onClick={() => input.current?.focus()}>
      <input
        ref={input}
        id={id}
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        aria-label="6 位验证码"
        aria-invalid={invalid || undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="absolute inset-0 z-10 w-full cursor-text bg-transparent text-transparent caret-transparent opacity-0 outline-none"
        onChange={(e) => {
          const next = e.target.value.replace(/\D/g, '').slice(0, 6);
          if (next !== value) onKeystroke?.();
          onChange(next);
          if (next.length === 6) onComplete?.(next);
        }}
      />
      <div className="grid grid-cols-6 gap-2">
        {digits.map((d, i) => {
          const filled = d.trim() !== '';
          const current = i === active && value.length < 6;
          return (
            <div
              key={i}
              className={cn(
                'relative flex h-14 items-center justify-center rounded-[12px] border font-mono text-[22px] tabular',
                'bg-[oklch(0.14_0.005_62/0.7)] shadow-[inset_0_1px_2px_oklch(0_0_0/0.35)] transition-[border-color,box-shadow] duration-200',
                invalid
                  ? 'border-[oklch(0.71_0.14_27/0.55)]'
                  : current && focused
                    ? 'border-accent-line shadow-[0_0_0_3px_var(--accent-soft)]'
                    : filled
                      ? 'border-line-strong'
                      : 'border-line',
                i === 3 && 'ml-1',
              )}
            >
              <span className={cn('transition-transform duration-200', filled ? 'scale-100 text-fg' : 'scale-90')}>{filled ? d : ''}</span>
              {current && focused && !disabled && (
                <span className="pointer-events-none absolute inset-y-4 left-1/2 flex -translate-x-1/2 gap-[3px]">
                  <span className="w-px bg-fg-soft [animation:breathe_1s_ease-in-out_infinite]" />
                  <span className="w-px bg-accent [animation:breathe_1s_ease-in-out_0.5s_infinite]" />
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
