'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { explain } from '@/lib/errors';
import { Button } from './Button';
import { toast } from './Toast';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /** 右侧抽屉样式（成员详情） */
  side?: boolean;
}

const noop = () => () => {};

/** 服务端渲染时为 false，到了浏览器为 true（portal 需要 document） */
function useMounted() {
  return useSyncExternalStore(noop, () => true, () => false);
}

export function Dialog({ open, onClose, title, description, children, footer, className, side }: DialogProps) {
  const mounted = useMounted();
  const panel = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    lastFocus.current = document.activeElement as HTMLElement;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      const target = panel.current?.querySelector<HTMLElement>('[data-autofocus], input, textarea, button:not([data-close])');
      (target ?? panel.current)?.focus();
    });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      lastFocus.current?.focus?.();
    };
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-[oklch(0.08_0.005_60/0.62)] backdrop-blur-[3px] animate-fade" onClick={onClose} />
      <div
        className={cn(
          'absolute',
          side
            ? 'inset-y-0 right-0 flex w-full max-w-[460px] p-2 sm:p-3'
            : 'inset-0 flex items-end justify-center p-3 sm:items-center',
        )}
      >
        <div
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          tabIndex={-1}
          className={cn(
            'slab relative flex max-h-full w-full flex-col overflow-hidden rounded-[18px] outline-none animate-rise',
            side ? 'h-full' : 'max-w-[440px]',
            className,
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 px-6 pt-5">
            <div className="space-y-1.5">
              <h2 className="text-[17px] font-semibold tracking-tight text-fg">{title}</h2>
              {description && <div className="text-sm leading-relaxed text-fg-soft">{description}</div>}
            </div>
            <button
              data-close
              onClick={onClose}
              className="-mr-2 flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-faint hover:bg-surface-2 hover:text-fg"
              aria-label="关闭"
            >
              <X className="size-4" />
            </button>
          </div>
          {children && <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-4 pb-2">{children}</div>}
          {footer && <div className="flex justify-end gap-2 px-6 pt-3 pb-5">{footer}</div>}
          {!children && !footer && <div className="h-5" />}
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface ConfirmProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: React.ReactNode;
  confirmText?: string;
  danger?: boolean;
}

export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmText = '确定', danger }: ConfirmProps) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button
            data-autofocus
            variant={danger ? 'danger' : 'primary'}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onClose();
              } catch (err) {
                toast.error(explain(err).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmText}
          </Button>
        </>
      }
    />
  );
}
