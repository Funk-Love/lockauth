'use client';

import {
  Ban,
  KeyRound,
  ListMinus,
  ListPlus,
  LogIn,
  Monitor,
  PenLine,
  Shield,
  ShieldOff,
  Smartphone,
  SquareArrowOutUpRight,
  TabletSmartphone,
  Undo2,
  UserCheck,
  UserPlus,
  UserX,
  Zap,
} from 'lucide-react';
import type { AuthLog } from '@/lib/api';
import { actionLabel, formatDate, maskIp, parseUserAgent, relativeTime, serviceName } from '@/lib/format';
import { useNow } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import { Badge, Empty } from '@/components/ui/bits';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  login: LogIn,
  register: UserPlus,
  reset_password: KeyRound,
  change_password: KeyRound,
  update_profile: PenLine,
  sso_authorize: SquareArrowOutUpRight,
  service_access: Zap,
  'admin.enable_user': UserCheck,
  'admin.disable_user': UserX,
  'admin.grant_admin': Shield,
  'admin.revoke_admin': ShieldOff,
  'admin.blacklist_add': Ban,
  'admin.blacklist_remove': Undo2,
  'admin.whitelist_add': ListPlus,
  'admin.whitelist_update': PenLine,
  'admin.whitelist_remove': ListMinus,
};

function DeviceIcon({ kind, className }: { kind: string; className?: string }) {
  if (kind === 'mobile') return <Smartphone className={className} />;
  if (kind === 'tablet') return <TabletSmartphone className={className} />;
  return <Monitor className={className} />;
}

/** 管理操作的对象，或资料修改的前后值 */
function subject(log: AuthLog): string | null {
  const d = log.detail;
  if (!d) return null;
  const target = d.target as { name?: string; email?: string } | undefined;
  if (target) return target.name || target.email || null;
  if (typeof d.email === 'string') return d.email;
  if (d.avatar === 'updated') return '更换头像';
  if (d.avatar === 'removed') return '移除头像';
  const name = d.name as { from?: string; to?: string } | undefined;
  if (name && typeof name === 'object' && name.to) return `${name.from ?? ''} → ${name.to}`;
  return null;
}

/** 登录记录时间线：一条细竖线串起来，失败的那条是红的 */
export function ActivityList({
  logs,
  compact = false,
  showWho = false,
  empty,
}: {
  logs: AuthLog[];
  compact?: boolean;
  showWho?: boolean;
  empty?: { title: string; body?: string };
}) {
  const now = useNow();
  if (!logs.length) {
    return (
      <Empty title={empty?.title ?? '暂无记录'}>{empty?.body}</Empty>
    );
  }
  return (
    <ol className="relative">
      <span aria-hidden className="absolute top-3 bottom-3 left-[15px] w-px bg-line-soft" />
      {logs.map((log) => {
        const Icon = ICONS[log.action] ?? Zap;
        const device = parseUserAgent(log.user_agent);
        const service = serviceName(log.service);
        const what = subject(log);
        return (
          <li key={log.id} className="relative flex gap-3.5 py-2.5">
            <span
              className={cn(
                'relative z-10 mt-0.5 flex size-[31px] shrink-0 items-center justify-center rounded-full border',
                log.success ? 'border-line bg-surface text-fg-soft' : 'border-[oklch(0.71_0.14_27/0.35)] bg-danger-soft text-danger',
              )}
            >
              <Icon className="size-[14px]" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={cn('text-[14px]', log.success ? 'text-fg' : 'text-danger')}>
                  {showWho && (log.user_name || log.email) ? <span className="mr-1.5 text-fg-soft">{log.user_name || log.email}</span> : null}
                  {actionLabel(log.action, log.success)}
                </span>
                {what && <span className="max-w-[16rem] truncate text-[13px] text-fg-faint">{what}</span>}
                {service && <Badge tone={log.service === 'ai' ? 'warn' : log.service === 'cloud' ? 'brass' : 'neutral'}>{service}</Badge>}
                {!log.success && log.error_message && <span className="text-[12.5px] text-fg-faint">· {log.error_message}</span>}
              </div>
              {!compact && (
                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[12.5px] text-fg-ghost">
                  <DeviceIcon kind={device.kind} className="size-3.5" />
                  <span>{device.label}</span>
                  <span>·</span>
                  <span className="font-mono tabular">{maskIp(log.ip_address)}</span>
                </p>
              )}
            </div>
            <time
              className="shrink-0 pt-1 text-[12.5px] text-fg-faint tabular"
              dateTime={log.created_at}
              title={formatDate(log.created_at, true)}
              data-now={now}
            >
              {relativeTime(log.created_at, now)}
            </time>
          </li>
        );
      })}
    </ol>
  );
}
