'use client';

import dynamic from 'next/dynamic';
import { Component, useCallback, useEffect, useState, useSyncExternalStore, type ReactNode, type TransitionEventHandler } from 'react';
import { useMediaQuery, useReducedMotion } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import type { StageProps, StageStatus } from './CylinderScene';

export type { StageStatus };

const CylinderScene = dynamic(() => import('./CylinderScene'), {
  ssr: false,
  loading: () => null,
});

let webglCache: boolean | null = null;
function detectWebGL(): boolean {
  if (webglCache !== null) return webglCache;
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2');
    webglCache = !!context;
    context?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webglCache = false;
  }
  return webglCache;
}

const noop = () => () => undefined;

/** 没归位时每颗弹子落下的距离（px），和 3D 里一样长短不一 */
const DROP = [8, 6, 10, 7, 9];

/** 页面先把表单交互准备好，空下来再开始加载 3D */
function useIdle() {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    const done = () => setIdle(true);
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(done, { timeout: 800 });
      return () => cancelIdleCallback(id);
    }
    const timer = setTimeout(done, 200);
    return () => clearTimeout(timer);
  }, []);
  return idle;
}

class StageBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function LockStage({ progress, pulse, status, open, className }: Omit<StageProps, 'lite' | 'reducedMotion'> & { className?: string }) {
  const hasWebGL = useSyncExternalStore(noop, detectWebGL, () => true);
  const reducedMotion = useReducedMotion();
  const small = useMediaQuery('(max-width: 767px)');
  const coarse = useMediaQuery('(pointer: coarse)');
  const idle = useIdle();
  const [ready, setReady] = useState(false);
  // 占位淡出结束后再卸载
  const [settled, setSettled] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const onUnavailable = useCallback(() => setContextLost(true), []);
  const shown = open ? 5 : progress;
  const still = <StagePlaceholder progress={shown} status={status} />;

  return (
    <div
      className={cn('relative', className)}
      aria-hidden
      // 画布四周柔化成透明，任何 3D 内容都不会在画布边上留下一条硬边
      style={{
        maskImage: 'linear-gradient(to bottom, transparent 0, #000 6%, #000 80%, transparent 100%), linear-gradient(to right, #000 84%, transparent 100%)',
        maskComposite: 'intersect',
        WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 6%, #000 80%, transparent 100%), linear-gradient(to right, #000 84%, transparent 100%)',
        WebkitMaskComposite: 'source-in',
      }}
    >
      {hasWebGL && !contextLost ? (
        <StageBoundary fallback={still}>
          {!settled && (
            <StagePlaceholder
              progress={shown}
              status={status}
              loading
              className={cn('transition-opacity duration-700 ease-out', ready && 'opacity-0')}
              onTransitionEnd={(e) => {
                if (ready && e.target === e.currentTarget) setSettled(true);
              }}
            />
          )}
          {idle && (
            <div className={cn('absolute inset-0 transition-opacity duration-700 ease-out', !ready && 'opacity-0')}>
              <CylinderScene progress={progress} pulse={pulse} status={status} open={open} lite={small || coarse} reducedMotion={reducedMotion} onReady={onReady} onUnavailable={onUnavailable} />
            </div>
          )}
        </StageBoundary>
      ) : still}
    </div>
  );
}

/**
 * 3D 还没出来、或者浏览器不支持 WebGL 时的样子：地面上一圈暖光，五颗弹子挂在剪切线下。
 * 填好一项，一颗弹子顶到线上；全部归位时剪切线亮起。加载中弹子依次轻轻明暗。
 */
function StagePlaceholder({ progress, status, loading, className, onTransitionEnd }: {
  progress: number;
  status: StageStatus;
  loading?: boolean;
  className?: string;
  onTransitionEnd?: TransitionEventHandler<HTMLDivElement>;
}) {
  const unlocked = status === 'success' || (status !== 'error' && progress >= 5);
  return (
    <div className={cn('absolute inset-0 flex items-center justify-center', className)} onTransitionEnd={onTransitionEnd}>
      <div className="absolute left-1/2 top-[56%] h-[46%] w-[72%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-[radial-gradient(closest-side,oklch(0.78_0.1_78/0.08),transparent)]" />
      <div className="relative w-[min(44%,230px)] animate-fade">
        <div
          className={cn(
            '-mx-[18%] h-px bg-[linear-gradient(to_right,transparent,var(--line-strong)_22%,var(--line-strong)_78%,transparent)] transition-shadow duration-500',
            unlocked && 'bg-[linear-gradient(to_right,transparent,var(--accent)_22%,var(--accent)_78%,transparent)] shadow-[0_0_14px_1px_var(--accent-line)]',
          )}
        />
        <div className="flex justify-between px-[4%]">
          {[0, 1, 2, 3, 4].map((i) => {
            const set = status !== 'error' && (status === 'success' || i < progress);
            return (
              <span
                key={i}
                className={cn(
                  'block h-[clamp(20px,3.2vw,30px)] w-[clamp(4px,0.55vw,6px)] rounded-full',
                  set ? 'bg-brass/80' : 'bg-fg-ghost/45',
                  loading && !set && 'animate-[breathe_1.8s_ease-in-out_infinite]',
                )}
                style={{
                  transform: `translateY(${set ? 0 : DROP[i]}px)`,
                  transition: 'transform 0.45s var(--ease-snap), background-color 0.3s ease',
                  animationDelay: `${i * 0.16}s`,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
