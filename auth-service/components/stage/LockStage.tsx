'use client';

import dynamic from 'next/dynamic';
import { Component, useCallback, useId, useState, useSyncExternalStore, type ReactNode } from 'react';
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
  const [ready, setReady] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const onUnavailable = useCallback(() => setContextLost(true), []);
  const fallback = <StageFallback progress={open ? 5 : progress} status={status} />;

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
        <StageBoundary fallback={fallback}>
          {!ready && fallback}
          <CylinderScene progress={progress} pulse={pulse} status={status} open={open} lite={small || coarse} reducedMotion={reducedMotion} onReady={onReady} onUnavailable={onUnavailable} />
        </StageBoundary>
      ) : fallback}
    </div>
  );
}

/** 没有 WebGL 或还在加载时：同一颗锁芯的平面剖面图，配色与 3D 一致 */
export function StageFallback({ progress, status, loading }: { progress: number; status: StageStatus; loading?: boolean }) {
  const id = useId().replace(/:/g, '');
  const paint = (name: string) => `url(#${id}-${name})`;
  const pins = [76, 118, 160, 202, 244];
  const keyLen = [26, 32, 22, 29, 26];
  const drop = [10, 8, 12, 9, 11];
  const shear = 106;
  const springTop = 50;
  const driverLen = 20;
  return (
    <div className={cn('absolute inset-0 flex items-center justify-center', loading && 'animate-fade')}>
      <svg viewBox="0 0 390 260" className="w-[min(82%,600px)]" data-stage-fallback>
        <defs>
          <linearGradient id={`${id}-housing`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#68635b" />
            <stop offset="0.3" stopColor="#46413a" />
            <stop offset="1" stopColor="#242321" />
          </linearGradient>
          <linearGradient id={`${id}-steel`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8d867a" />
            <stop offset="0.45" stopColor="#a49a88" />
            <stop offset="1" stopColor="#625c51" />
          </linearGradient>
          <linearGradient id={`${id}-brass`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#b09065" />
            <stop offset="0.45" stopColor="#8b6d44" />
            <stop offset="1" stopColor="#614d35" />
          </linearGradient>
          <linearGradient id={`${id}-pin`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#8a6a3c" />
            <stop offset="0.45" stopColor="#e2bf82" />
            <stop offset="1" stopColor="#7a5c33" />
          </linearGradient>
          <linearGradient id={`${id}-driver`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#7c7e80" />
            <stop offset="0.45" stopColor="#e4e5e6" />
            <stop offset="1" stopColor="#6d6f71" />
          </linearGradient>
        </defs>
        <ellipse cx="191" cy="228" rx="145" ry="10" fill="#000" opacity="0.25" />
        <g transform="translate(9 24) matrix(1 .12 0 1 0 -15)">
        {/* 锁体外形：上面弹子室，下面锁芯 */}
        <path d="M40 50 L83 22 H300 Q314 22 314 36 V90 L275 113 H40Z" fill={paint('housing')} stroke="#777065" strokeWidth="0.6" />
        <rect x="40" y="36" width="240" height="90" rx="14" fill={paint('housing')} />
        <rect x="30" y="98" width="260" height="90" rx="45" fill={paint('housing')} />
        {/* 剖开的窗口 */}
        <rect x="58" y="44" width="204" height="62" fill={paint('steel')} stroke="#a69d8e" strokeWidth="0.7" />
        <rect x="58" y="106" width="204" height="62" fill={paint('brass')} />
        <rect x="58" y="140" width="204" height="14" fill="#5e4729" />
        <rect x="58" y="168" width="204" height="10" fill={paint('steel')} />
        {Array.from({ length: 22 }, (_, i) => <path key={i} d={`M58 ${48 + i * 2.5} Q160 ${43 + i * 2.5} 262 ${48 + i * 2.5}`} stroke="#28241c" opacity="0.14" strokeWidth="0.35" fill="none" />)}
        <line x1="58" y1={shear} x2="262" y2={shear} stroke="#39a790" opacity={progress >= 5 || status === 'success' ? 0.7 : 0.2} strokeWidth="1" />
        {pins.map((x, i) => {
          const set = status !== 'error' && (status === 'success' || i < progress);
          const off = set ? 0 : drop[i];
          const ease = 'transform 0.4s var(--ease-snap)';
          const springLen = shear - driverLen - springTop;
          return (
            <g key={i}>
              <rect x={x - 7} y={springTop - 4} width="14" height={shear - springTop + 4} fill="#2a2826" />
              <rect x={x - 7} y={shear} width="14" height="34" fill="#4a3822" />
              <path
                d={`M${x - 5} ${springTop} ${Array.from({ length: 9 }, (_, k) => `L${x + (k % 2 ? -5 : 5)} ${springTop + ((k + 1) * springLen) / 9}`).join(' ')}`}
                stroke="#a9a7a2"
                fill="none"
                strokeWidth="1.1"
                style={{ transition: ease, transformBox: 'fill-box', transformOrigin: 'top', transform: `scaleY(${(springLen + off) / springLen})` }}
              />
              <g style={{ transition: ease, transform: `translateY(${off}px)` }}>
                <rect x={x - 6} y={shear - driverLen} width="12" height={driverLen} rx="1.5" fill={paint('driver')} />
                <path d={`M${x - 6} ${shear} h12 v${keyLen[i] - 6} l-6 6 l-6 -6 z`} fill={paint('pin')} />
              </g>
            </g>
          );
        })}
        <path d="M278 43 L308 24 Q321 23 321 38 V92 C360 112 357 158 321 177 L284 195 C307 163 301 115 278 100Z" fill={paint('housing')} stroke="#797164" strokeWidth="0.6" />
        <ellipse cx="309" cy="142" rx="30" ry="44" fill={paint('brass')} stroke="#b19771" strokeWidth="1.2" />
        <ellipse cx="309" cy="142" rx="24" ry="36" fill="none" stroke="#356759" opacity="0.55" strokeWidth="2" />
        <g transform={`rotate(${status !== 'error' && (status === 'success' || progress >= 5) ? 90 : 0} 309 142)`}>
          <path d="M306 125 H312 V138 H309 V144 H314 V160 H306 V148 H303 V139 H306Z" fill="#151310" />
          <path d="M308 148 V157" stroke="#39a790" strokeWidth="1.1" />
        </g>
        </g>
      </svg>
    </div>
  );
}
