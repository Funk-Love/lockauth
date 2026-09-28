import Link from 'next/link';
import { LockMark, Wordmark } from '@/components/brand/LockMark';

export default function NotFound() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(50% 40% at 50% 42%, oklch(0.77 0.074 176 / 0.07), transparent 70%)' }}
      />
      <div className="relative animate-rise">
        <LockMark size={64} idle className="mx-auto text-fg-soft" />
        <p className="mt-10 font-display-soft text-[15px] tracking-[0.3em] text-fg-ghost">404</p>
        <h1 className="mt-3 font-serif-sc text-[30px] font-semibold text-fg">找不到此页面</h1>
        <p className="mx-auto mt-3 max-w-sm text-[14px] leading-relaxed text-fg-soft">链接可能有误，或页面已被移除。</p>
        <Link
          href="/"
          className="mt-8 inline-flex h-10 items-center rounded-[11px] border border-line bg-surface-2 px-5 text-[14px] text-fg transition-colors hover:border-line-strong hover:bg-surface-3"
        >
          返回首页
        </Link>
      </div>
      <Wordmark subtle className="absolute bottom-8 text-[15px]" />
    </main>
  );
}
