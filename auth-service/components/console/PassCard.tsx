'use client';

import type { User } from '@/lib/api';
import { formatDate, memberNumber } from '@/lib/format';
import { isZju } from '@/lib/validate';
import { LockMark } from '@/components/brand/LockMark';
import { Tilt } from './Tilt';

/**
 * 你的通行证：一张会跟着指针倾斜的卡。
 * 右侧的两道竖线和钥匙槽同源；光泽在铜绿和黄铜之间流动。
 */
export function PassCard({ user }: { user: User }) {
  const alumni = !isZju(user.email);
  return (
    <div className="relative [perspective:1200px]">
      {/* 卡片下方的投影，让它像浮在桌面上方 */}
      <div aria-hidden className="absolute inset-x-8 -bottom-5 h-10 rounded-[50%] bg-[oklch(0_0_0/0.55)] blur-2xl" />
      <Tilt
        max={10}
        className="group relative aspect-[1.586/1] w-full overflow-hidden rounded-[22px] border border-[oklch(1_0_0/0.09)] p-6 shadow-[var(--shadow-lg)] sm:p-7"
        style={{
          background:
            'radial-gradient(120% 90% at 0% 0%, oklch(0.3 0.03 176 / 0.55), transparent 55%), radial-gradient(90% 80% at 100% 100%, oklch(0.34 0.05 72 / 0.45), transparent 60%), linear-gradient(160deg, oklch(0.23 0.01 62), oklch(0.16 0.006 62))',
        }}
      >
        {/* 跟随指针的光泽 */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60 transition-opacity duration-500 group-hover:opacity-100"
          style={{
            background:
              'radial-gradient(40% 50% at var(--mx, 70%) var(--my, 20%), oklch(0.9 0.05 176 / 0.16), transparent 70%), linear-gradient(115deg, transparent 30%, oklch(0.9 0.06 90 / 0.07) 45%, oklch(0.85 0.06 176 / 0.08) 55%, transparent 70%)',
          }}
        />
        {/* 细密的横纹，像压印在卡面上 */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: 'repeating-linear-gradient(0deg, oklch(1 0 0) 0 1px, transparent 1px 4px)' }}
        />

        <div className="relative flex h-full flex-col justify-between [transform:translateZ(30px)]">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5 text-fg">
              <LockMark size={24} />
              <span className="text-[10.5px] tracking-[0.34em] text-fg-soft">FUNK &amp; LOVE</span>
            </div>
            <span className="rounded-full border border-[oklch(1_0_0/0.12)] px-2 py-0.5 text-[10.5px] tracking-[0.18em] text-fg-soft">
              {user.is_admin ? 'ADMIN' : alumni ? 'ALUMNI' : 'MEMBER'}
            </span>
          </div>

          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0 space-y-1.5">
              <p className="truncate font-serif-sc text-[26px] leading-none font-semibold text-fg sm:text-[30px]">{user.name}</p>
              <p className="truncate text-[12.5px] text-fg-soft">{user.email}</p>
              <p className="pt-2 font-mono text-[11px] tracking-[0.16em] text-fg-faint tabular">
                No.{memberNumber(user.id)} · SINCE {formatDate(user.created_at)}
              </p>
            </div>
            <span aria-hidden className="mb-1 flex h-14 shrink-0 gap-[5px]">
              <span className="w-[2px] rounded-full bg-fg-soft/70" />
              <span className="w-[2px] rounded-full bg-accent shadow-[0_0_12px_var(--accent)]" />
            </span>
          </div>
        </div>
      </Tilt>
    </div>
  );
}
