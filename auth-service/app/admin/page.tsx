'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { api, type AuthLog, type Overview } from '@/lib/api';
import { formatDate, SERVICE_META } from '@/lib/format';
import { explain } from '@/lib/errors';
import { ActivityList } from '@/components/console/ActivityList';
import { AreaChart, BarList, ChartCard, ColumnChart, Meter, type Datum } from '@/components/console/Charts';
import { PageHeader, SectionTitle } from '@/components/console/ConsoleShell';
import { Empty } from '@/components/ui/bits';

function StatTile({ label, value, note, href }: { label: string; value: number; note?: React.ReactNode; href?: string }) {
  const body = (
    <>
      <p className="text-[12.5px] text-fg-faint">{label}</p>
      <p className="mt-2 text-[26px] leading-none font-semibold text-fg">{value.toLocaleString('zh-CN')}</p>
      {note && <p className="mt-2 text-[12px] text-fg-ghost">{note}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="card block p-4 transition-colors hover:border-line">
      {body}
    </Link>
  ) : (
    <div className="card p-4">{body}</div>
  );
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [failed, setFailed] = useState<AuthLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.admin.overview().then(setData).catch((e) => setError(explain(e).message));
    api.admin
      .logs({ result: 'failed', per_page: 5 })
      .then((r) => setFailed(r.logs))
      .catch(() => setFailed([]));
  }, []);

  if (error) {
    return (
      <div>
        <PageHeader title="概览" />
        <Empty title="无法载入数据">{error}</Empty>
      </div>
    );
  }

  const u = data?.users;
  const months: Datum[] =
    data?.registrations.map((r) => {
      const [yy, mm] = r.month.split('-');
      return { label: `${Number(mm)}月`, full: `${yy} 年 ${Number(mm)} 月`, value: r.count };
    }) ?? [];
  const days: Datum[] =
    data?.daily_active.map((d) => {
      const [, mm, dd] = d.date.split('-');
      return { label: `${Number(mm)}/${Number(dd)}`, full: `${Number(mm)} 月 ${Number(dd)} 日`, value: d.users };
    }) ?? [];
  // 有人通过 LockAuth 登录过的服务都列出来，按人数排
  const services = Object.entries(data?.services ?? {})
    .map(([key, value]) => ({ key, label: SERVICE_META[key]?.name ?? key, value }))
    .sort((a, b) => b.value - a.value);
  const tracked = data?.tracking_since ? formatDate(data.tracking_since) : null;

  return (
    <div className="space-y-8">
      <PageHeader title="概览" />

      {/* 头条数字 + 统计块 */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_2fr] animate-rise">
        <div className="card relative overflow-hidden p-6">
          <div aria-hidden className="hairlines absolute top-6 right-6 h-10 w-[6px] opacity-60" />
          <p className="text-[13px] text-fg-faint">成员总数</p>
          {u ? (
            <p className="mt-3 text-[56px] leading-none font-semibold tracking-tight text-fg">{u.total.toLocaleString('zh-CN')}</p>
          ) : (
            <div className="skeleton mt-3 h-14 w-28" />
          )}
          <p className="mt-4 text-[13px] text-fg-soft">
            {u ? (
              <>
                近 30 天新增 <span className="text-fg tabular">{u.new_30d}</span> 位
              </>
            ) : (
              ' '
            )}
          </p>
          <div className="mt-6 space-y-4 border-t border-line-soft pt-5">
            {data ? (
              <>
                <Meter label="近 30 天登录过" value={data.users.active_30d} total={data.users.active || 1} />
                <Meter label="白名单已注册" value={data.whitelist.registered} total={data.whitelist.total} />
              </>
            ) : (
              <div className="skeleton h-16" />
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {u ? (
            <>
              <StatTile label="近 7 天活跃" value={u.active_7d} />
              <StatTile label="近 30 天活跃" value={u.active_30d} />
              <StatTile label="校友" value={u.alumni} href="/admin/users?status=alumni" />
              <StatTile label="管理员" value={u.admins} href="/admin/users?status=admin" />
              <StatTile label="从未登录" value={u.never_logged_in} href="/admin/users?status=dormant" />
              <StatTile label="已停用" value={u.disabled} href="/admin/users?status=disabled" />
            </>
          ) : (
            Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-[104px] rounded-[14px]" />)
          )}
        </div>
      </section>

      {/* 趋势 */}
      <section className="grid gap-4 lg:grid-cols-2 animate-rise [animation-delay:100ms]">
        <ChartCard
          title="每日活跃"
          subtitle={tracked ? `近 30 天 · ${tracked} 起有记录` : '近 30 天'}
          table={{ headers: ['日期', '人数'], rows: days.map((d) => [d.full, d.value]) }}
        >
          {data ? <AreaChart data={days} unit="人" /> : <div className="skeleton h-[200px]" />}
        </ChartCard>
        <ChartCard
          title="新注册"
          subtitle="近 12 个月"
          table={{ headers: ['月份', '注册数'], rows: months.map((d) => [d.full, d.value]) }}
        >
          {data ? <ColumnChart data={months} unit="位" /> : <div className="skeleton h-[200px]" />}
        </ChartCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1.3fr] animate-rise [animation-delay:180ms]">
        <ChartCard title="服务使用" subtitle="近 30 天，按人数">
          {data ? <BarList items={services} unit="人" /> : <div className="skeleton h-[140px]" />}
        </ChartCard>

        <div className="card p-5 sm:p-6">
          <SectionTitle
            aside={
              <Link href="/admin/logs?result=failed" className="flex items-center gap-1 text-[12.5px] text-fg-faint hover:text-accent-ink">
                全部 <ArrowRight className="size-3.5" />
              </Link>
            }
          >
            登录失败
          </SectionTitle>
          {data && (
            <p className="-mt-1 mb-3 flex items-center gap-1.5 text-[13px]">
              {data.failed_logins_24h > 0 ? (
                <>
                  <AlertTriangle className="size-3.5 text-warn" />
                  <span className="text-fg-soft">
                    近 24 小时 <span className="text-warn tabular">{data.failed_logins_24h}</span> 次
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-3.5 text-accent" />
                  <span className="text-fg-soft">近 24 小时无失败</span>
                </>
              )}
            </p>
          )}
          {failed ? <ActivityList logs={failed} showWho empty={{ title: '暂无失败记录' }} /> : <div className="skeleton h-40" />}
        </div>
      </section>
    </div>
  );
}
