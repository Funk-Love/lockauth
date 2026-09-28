'use client';

import { useEffect, useState } from 'react';
import { Check, Info, X } from 'lucide-react';
import { cn } from '@/lib/cn';

type Tone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  tone: Tone;
  message: string;
}

let seq = 0;
const listeners = new Set<(items: ToastItem[]) => void>();
let items: ToastItem[] = [];

function emit() {
  listeners.forEach((l) => l(items));
}

function push(tone: Tone, message: string, ms = 3200) {
  const id = ++seq;
  items = [...items.slice(-2), { id, tone, message }];
  emit();
  setTimeout(() => dismiss(id), ms);
}

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  success: (m: string) => push('success', m),
  error: (m: string) => push('error', m, 4200),
  info: (m: string) => push('info', m),
};

export function Toaster() {
  const [list, setList] = useState<ToastItem[]>([]);
  useEffect(() => {
    listeners.add(setList);
    return () => {
      listeners.delete(setList);
    };
  }, []);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-[80] flex flex-col items-center gap-2 px-4"
      aria-live="polite"
    >
      {list.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          className="slab pointer-events-auto flex max-w-md items-center gap-3 rounded-[14px] py-2.5 pr-2 pl-3.5 text-sm text-fg animate-rise"
        >
          <span
            className={cn(
              'flex size-5 shrink-0 items-center justify-center rounded-full',
              t.tone === 'success' && 'bg-accent-soft text-accent',
              t.tone === 'error' && 'bg-danger-soft text-danger',
              t.tone === 'info' && 'bg-surface-3 text-fg-soft',
            )}
          >
            {t.tone === 'success' ? <Check className="size-3" strokeWidth={3} /> : t.tone === 'error' ? <X className="size-3" strokeWidth={3} /> : <Info className="size-3" />}
          </span>
          <span className="leading-snug">{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            className="ml-1 flex size-7 items-center justify-center rounded-lg text-fg-faint hover:bg-surface-2 hover:text-fg"
            aria-label="关闭"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
