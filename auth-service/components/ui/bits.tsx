'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';

// ---------------------------------------------------------------- Badge

type BadgeTone = 'neutral' | 'accent' | 'danger' | 'warn' | 'brass';

export function Badge({ tone = 'neutral', children, className, dot }: { tone?: BadgeTone; children: React.ReactNode; className?: string; dot?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center gap-1.5 rounded-full border px-2 text-[11.5px] font-medium whitespace-nowrap',
        tone === 'neutral' && 'border-line bg-surface-2 text-fg-soft',
        tone === 'accent' && 'border-accent-line bg-accent-soft text-accent-ink',
        tone === 'danger' && 'border-[oklch(0.71_0.14_27/0.3)] bg-danger-soft text-danger',
        tone === 'warn' && 'border-[oklch(0.82_0.11_85/0.3)] bg-[oklch(0.82_0.11_85/0.1)] text-warn',
        tone === 'brass' && 'border-[oklch(0.78_0.1_78/0.3)] bg-[oklch(0.78_0.1_78/0.1)] text-brass',
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

// ---------------------------------------------------------------- Avatar

export function Avatar({ name, src, size = 36, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  // 记住是哪张图加载失败了；换了 src 自然就重新尝试
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const show = src && failedSrc !== src;
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-[radial-gradient(120%_120%_at_30%_20%,oklch(0.3_0.02_176),oklch(0.2_0.01_62))] font-medium text-fg-soft',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.36) }}
    >
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" onError={() => setFailedSrc(src)} />
      ) : (
        <span className="font-serif-sc">{initials(name)}</span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------- Segmented

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number }[];
  className?: string;
}) {
  return (
    <div className={cn('inline-flex max-w-full flex-wrap gap-1 rounded-[12px] border border-line-soft bg-bg-deep/60 p-1', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-7 rounded-[8px] px-2.5 text-[13px] transition-colors',
            value === o.value ? 'bg-surface-3 text-fg shadow-[var(--edge)]' : 'text-fg-faint hover:text-fg-soft',
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="ml-1.5 text-fg-ghost tabular">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Pagination

export function Pager({ page, pages, total, onChange }: { page: number; pages: number; total: number; onChange: (p: number) => void }) {
  if (pages <= 1) return <p className="text-xs text-fg-faint tabular">共 {total} 条</p>;
  return (
    <div className="flex items-center gap-3 text-xs text-fg-faint">
      <span className="tabular">
        共 {total} 条 · 第 {page}/{pages} 页
      </span>
      <div className="flex gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="flex size-8 items-center justify-center rounded-lg border border-line text-fg-soft hover:bg-surface-2 disabled:opacity-35"
          aria-label="上一页"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          onClick={() => onChange(page + 1)}
          disabled={page >= pages}
          className="flex size-8 items-center justify-center rounded-lg border border-line text-fg-soft hover:bg-surface-2 disabled:opacity-35"
          aria-label="下一页"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Empty

export function Empty({ title, children, className }: { title: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 py-14 text-center', className)}>
      <span className="mb-2 flex gap-[5px]" aria-hidden>
        <span className="h-7 w-px bg-line-strong" />
        <span className="h-7 w-px bg-accent-line" />
      </span>
      <p className="text-sm text-fg-soft">{title}</p>
      {children && <div className="max-w-xs text-xs leading-relaxed text-fg-faint">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Search input

export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        'h-9 w-full rounded-[10px] border border-line bg-bg-deep/60 px-3 text-sm text-fg placeholder:text-fg-ghost outline-none transition-colors',
        'focus:border-accent-line focus:shadow-[0_0_0_3px_var(--accent-soft)] sm:w-64',
        className,
      )}
    />
  );
}
