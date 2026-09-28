'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { api, type Activity } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { greeting, relativeTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { ActivityList } from '@/components/console/ActivityList';
import { SectionTitle } from '@/components/console/ConsoleShell';
import { PassCard } from '@/components/console/PassCard';

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function Hallway() {
  const { user } = useAuth();
  const welcome = useSearchParams().get('welcome') === '1';
  const [activity, setActivity] = useState<Activity | null>(null);
  const today = useMemo(() => new Date(), []);
  const hello = useMemo(() => greeting(today), [today]);

  useEffect(() => {
    api.activity(8).then(setActivity).catch(() => setActivity({ logs: [], services: {}, stats: { logins_30d: 0, member_days: 1, is_alumni: false } }));
  }, []);

  if (!user) return null;

  return (
    <div className="space-y-12">
      {/* 问候 + 通行证 */}
      <section className="grid items-center gap-10 lg:grid-cols-[1fr_minmax(0,420px)] lg:gap-14">
        <div className="space-y-5 animate-rise">
          <p className="text-[12px] tracking-[0.2em] text-fg-faint">
            {today.getMonth() + 1} 月 {today.getDate()} 日 · {WEEKDAYS[today.getDay()]}
          </p>
          <h1 className="font-serif-sc text-[34px] leading-[1.2] font-semibold text-fg sm:text-[42px]">
            {welcome ? '欢迎加入，' : `${hello}，`}
            <br className="sm:hidden" />
            {user.name}。
          </h1>
          <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2 text-[13px] text-fg-faint">
            <span>
              近 30 天登录 <span className="text-fg-soft tabular">{activity?.stats.logins_30d ?? '—'}</span> 次
            </span>
            <span>
              上次登录 <span className="text-fg-soft">{relativeTime(user.last_login)}</span>
            </span>
          </div>
        </div>
        <div className="animate-rise [animation-delay:120ms]">
          <PassCard user={user} />
        </div>
      </section>

      {/* 最近动态 + 管理入口 */}
      <section className={cn('grid gap-6 animate-rise [animation-delay:200ms]', user.is_admin && 'lg:grid-cols-[1fr_300px]')}>
        <div>
          <SectionTitle
            aside={
              <Link href="/dashboard/security" className="text-[12.5px] text-fg-faint transition-colors hover:text-accent-ink">
                查看全部
              </Link>
            }
          >
            最近活动
          </SectionTitle>
          <div className="card px-4 py-2 sm:px-5">
            {activity ? <ActivityList logs={activity.logs.slice(0, 6)} /> : <div className="skeleton my-3 h-40" />}
          </div>
        </div>

        {user.is_admin && (
          <div>
            <SectionTitle>管理</SectionTitle>
            <Link href="/admin" className="card group flex items-center gap-3 p-4 transition-colors hover:border-line">
              <span className="flex size-9 items-center justify-center rounded-[10px] bg-accent-soft text-accent">
                <ShieldCheck className="size-[18px]" />
              </span>
              <span className="flex-1">
                <span className="block text-[14px] text-fg">管理后台</span>
                <span className="block text-[12.5px] text-fg-faint">成员、白名单、操作日志</span>
              </span>
              <ArrowRight className="size-4 text-fg-ghost transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense>
      <Hallway />
    </Suspense>
  );
}
