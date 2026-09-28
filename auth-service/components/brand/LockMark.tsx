'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { cn } from '@/lib/cn';

gsap.registerPlugin(useGSAP);

interface LockMarkProps {
  size?: number;
  /** 每次变化，锁芯就"咔哒"转一下再回来（比如登录成功时） */
  turnKey?: number | string;
  /** 静止时偶尔犹豫一下 */
  idle?: boolean;
  className?: string;
  title?: string;
}

/**
 * 品牌标：正面看过去的一颗锁芯——外圈是锁胆，
 * 中间实心的是锁芯，钥匙槽是两道并行细竖线，一道是铜绿。
 * LockAI 画的是一整把锁，LockAuth 画的是锁里面那颗芯。
 */
export function LockMark({ size = 28, turnKey, idle = false, className, title = 'LockAuth' }: LockMarkProps) {
  const root = useRef<SVGSVGElement>(null);
  const keyway = useRef<SVGGElement>(null);
  const first = useRef(true);

  useGSAP(() => {
    gsap.set(keyway.current, { transformOrigin: '16px 16px', rotation: 0 });
    if (!idle || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // 犹豫：转一点——停——回来——停，切分的节奏，不是匀速摆动
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 3.2 });
    tl.to(keyway.current, { rotation: 14, duration: 0.16, ease: 'power2.out' })
      .to(keyway.current, { rotation: 14, duration: 0.24 })
      .to(keyway.current, { rotation: 0, duration: 0.14, ease: 'back.out(3)' })
      .to(keyway.current, { rotation: 0, duration: 0.5 })
      .to(keyway.current, { rotation: 8, duration: 0.12, ease: 'power2.out' })
      .to(keyway.current, { rotation: 0, duration: 0.14, ease: 'back.out(3)' });
  }, { scope: root, dependencies: [idle] });

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (turnKey === undefined || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.timeline()
      .to(keyway.current, { rotation: 90, duration: 0.26, ease: 'power4.out' })
      .to(keyway.current, { rotation: 90, duration: 0.55 })
      .to(keyway.current, { rotation: 0, duration: 0.5, ease: 'power2.inOut' });
  }, [turnKey]);

  return (
    <svg
      ref={root}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label={title}
      className={cn('shrink-0 overflow-visible', className)}
    >
      {/* 锁胆外圈 */}
      <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="1.3" opacity="0.45" />
      {/* 锁芯 */}
      <circle cx="16" cy="16" r="9.4" fill="currentColor" />
      <g ref={keyway}>
        <rect x="13.95" y="11.5" width="1.7" height="9" rx="0.85" fill="var(--bg)" />
        <rect x="16.95" y="11.5" width="1.7" height="9" rx="0.85" fill="var(--accent)" />
      </g>
    </svg>
  );
}

/** 字标：LockAuth。"Lock" 用柔软的 70 年代斜衬线，"Auth" 收一点，和 LockAI 同一写法 */
export function Wordmark({ className, subtle = false }: { className?: string; subtle?: boolean }) {
  return (
    <span
      className={cn('font-display text-[19px] leading-none tracking-[-0.02em] text-fg', className)}
      style={{ fontVariationSettings: '"SOFT" 100, "WONK" 1, "opsz" 72' }}
    >
      <span className="italic">Lock</span>
      <span
        className={cn('ml-[1px]', subtle ? 'text-fg-faint' : 'text-fg-soft')}
        style={{ fontVariationSettings: '"SOFT" 0, "WONK" 0, "opsz" 72' }}
      >
        Auth
      </span>
    </span>
  );
}

export function Brand({ className, turnKey, idle }: { className?: string; turnKey?: number | string; idle?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 text-fg', className)}>
      <LockMark size={26} turnKey={turnKey} idle={idle} />
      <Wordmark />
    </span>
  );
}
