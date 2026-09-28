'use client';

import { useRef } from 'react';
import { useReducedMotion } from '@/lib/hooks';
import { cn } from '@/lib/cn';

/**
 * 跟着指针微微倾斜的容器，给卡片一点空间感。
 * 子元素里用 var(--mx) / var(--my)（0–100%）可以画跟随指针的光。
 */
export function Tilt({
  children,
  className,
  max = 8,
  as: Tag = 'div',
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  max?: number;
  as?: 'div' | 'button' | 'a';
} & React.HTMLAttributes<HTMLElement> & { href?: string; disabled?: boolean; type?: 'button' }) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const frame = useRef(0);

  const onMove = (e: React.PointerEvent<HTMLElement>) => {
    if (reduced || e.pointerType !== 'mouse' || !ref.current) return;
    const el = ref.current;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
      el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
      el.style.transform = `perspective(900px) rotateX(${((0.5 - y) * max).toFixed(2)}deg) rotateY(${((x - 0.5) * max).toFixed(2)}deg) translateZ(0)`;
    });
  };

  const onLeave = () => {
    if (!ref.current) return;
    cancelAnimationFrame(frame.current);
    ref.current.style.transform = '';
  };

  // 三种标签共用一套 props，这里放宽类型
  const Comp = Tag as unknown as React.ComponentType<Record<string, unknown>>;
  return (
    <Comp
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={cn('transition-transform duration-500 ease-[var(--ease-out)] will-change-transform [transform-style:preserve-3d]', className)}
      {...rest}
    >
      {children}
    </Comp>
  );
}
