'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Brand } from '@/components/brand/LockMark';
import { LockStage, type StageStatus } from '@/components/stage/LockStage';
import { useReducedMotion } from '@/lib/hooks';

interface StageControl {
  setProgress: (n: number) => void;
  tap: () => void;
  setStatus: (s: StageStatus) => void;
  /** 失败：弹子掉回去，一秒后回到静止 */
  fail: () => void;
  /** 成功：锁芯转过去定住，品牌标也跟着转一下 */
  succeed: () => void;
}

const StageContext = createContext<StageControl | null>(null);

export function useStage(): StageControl {
  const ctx = useContext(StageContext);
  if (!ctx) throw new Error('useStage 需要放在 EntranceShell 里');
  return ctx;
}

/**
 * 入口页骨架：左边（手机上是上边）是那颗锁芯，右边一块浮在空间里的雾面玻璃板放表单。
 * 表单通过 useStage() 驱动弹子。
 */
export function EntranceShell({ children }: { children: React.ReactNode }) {
  const [progress, setProgress] = useState(0);
  const [pulse, setPulse] = useState(0);
  const [status, setStatus] = useState<StageStatus>('idle');
  const [turnKey, setTurnKey] = useState(0);
  const failTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const control = useMemo<StageControl>(
    () => ({
      setProgress,
      tap: () => setPulse((p) => p + 1),
      setStatus: (s) => {
        if (failTimer.current) clearTimeout(failTimer.current);
        setStatus(s);
      },
      fail: () => {
        if (failTimer.current) clearTimeout(failTimer.current);
        setStatus('error');
        failTimer.current = setTimeout(() => setStatus('idle'), 1100);
      },
      succeed: () => {
        if (failTimer.current) clearTimeout(failTimer.current);
        setStatus('success');
        setTurnKey((k) => k + 1);
      },
    }),
    [],
  );

  useEffect(() => () => {
    if (failTimer.current) clearTimeout(failTimer.current);
  }, []);

  // 玻璃板跟着指针轻轻偏一点角度，和后面的锁芯一起构成景深
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (reduced || e.pointerType !== 'mouse' || !panel.current) return;
      const x = e.clientX / window.innerWidth - 0.5;
      const y = e.clientY / window.innerHeight - 0.5;
      panel.current.style.transform = `perspective(1400px) rotateY(${(-x * 3).toFixed(2)}deg) rotateX(${(y * 2.2).toFixed(2)}deg)`;
    },
    [reduced],
  );

  const year = new Date().getFullYear();

  return (
    <StageContext.Provider value={control}>
      <main
        onPointerMove={onPointerMove}
        className="relative isolate flex min-h-dvh flex-col overflow-x-hidden bg-bg lg:block lg:overflow-hidden"
      >
        {/* 光：一池暖光打在锁芯上，右下角一点铜绿的反光，四周压暗 */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background: [
              'radial-gradient(52% 46% at 33% 46%, oklch(0.27 0.022 68 / 0.75), transparent 70%)',
              'radial-gradient(34% 30% at 30% 78%, oklch(0.42 0.05 176 / 0.12), transparent 70%)',
              'radial-gradient(30% 40% at 88% 10%, oklch(0.3 0.02 70 / 0.25), transparent 70%)',
              'radial-gradient(140% 100% at 45% 40%, transparent 50%, oklch(0.09 0.005 60 / 0.85))',
            ].join(','),
          }}
        />

        <header className="relative z-20 flex items-center justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8 lg:absolute lg:inset-x-0 lg:top-0 lg:pt-7">
          <Link href="/" aria-label="LockAuth 首页" className="rounded-lg">
            <Brand turnKey={turnKey} />
          </Link>
          <a
            href="https://funk-and.love"
            className="group inline-flex items-center gap-1 text-[13px] text-fg-faint transition-colors hover:text-fg"
          >
            Funk &amp; Love
            <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
        </header>

        {/* 锁芯 */}
        <LockStage
          progress={progress}
          pulse={pulse}
          status={status}
          open={progress >= 5 && status !== 'error'}
          className="h-[34vh] min-h-[230px] w-full shrink-0 lg:absolute lg:inset-y-0 lg:left-0 lg:h-auto lg:w-[60%]"
        />

        {/* 表单板 */}
        <section className="relative z-10 flex flex-1 items-start justify-center px-4 pb-10 sm:px-6 lg:absolute lg:inset-y-0 lg:right-0 lg:w-[44%] lg:overflow-y-auto lg:py-[76px] lg:pr-[max(3rem,6vw)] lg:pl-0 [scrollbar-width:none]">
          {/* 入场动画和指针倾斜分在两层：动画结束后的 transform 会盖住行内样式 */}
          {/* my-auto：够高时居中，不够高时从顶部开始、整块可滚动，不会被裁掉 */}
          <div className="w-full max-w-[440px] animate-rise lg:my-auto">
            <div
              ref={panel}
              className="slab w-full rounded-[26px] px-6 py-7 transition-transform duration-500 ease-out will-change-transform sm:px-9 sm:py-9 [@media(max-height:760px)]:sm:py-7"
            >
              {children}
            </div>
          </div>
        </section>

        <footer className="relative z-10 px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center text-[11px] text-fg-ghost lg:absolute lg:right-0 lg:bottom-6 lg:w-[44%] lg:pr-[max(3rem,6vw)] lg:pb-0 lg:text-right lg:[@media(max-height:760px)]:hidden">
          © {year} Funk &amp; Love · 浙江大学 DFM 街舞社
        </footer>
      </main>
    </StageContext.Provider>
  );
}

/** 表单板里的标题区 */
export function PanelHeading({ eyebrow, title, children }: { eyebrow?: React.ReactNode; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-7 space-y-3">
      {eyebrow && <div className="text-[12px] tracking-[0.18em] text-fg-faint">{eyebrow}</div>}
      <h1 className="font-serif-sc text-[28px] leading-[1.25] font-semibold tracking-[0.01em] text-fg sm:text-[30px]">{title}</h1>
      {children && <div className="text-[14px] leading-relaxed text-fg-soft">{children}</div>}
    </div>
  );
}
