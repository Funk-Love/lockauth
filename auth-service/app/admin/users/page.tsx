'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChevronRight, Shield, ShieldOff, UserCheck, UserX } from 'lucide-react';
import { api, type AuthLog, type Pagination, type User } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { explain } from '@/lib/errors';
import { formatDate, memberNumber, relativeTime } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import { isZju } from '@/lib/validate';
import { cn } from '@/lib/cn';
import { ActivityList } from '@/components/console/ActivityList';
import { PageHeader, SectionTitle } from '@/components/console/ConsoleShell';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { Avatar, Badge, Empty, Pager, SearchInput, Segmented } from '@/components/ui/bits';
import { toast } from '@/components/ui/Toast';

type Status = '' | 'active' | 'disabled' | 'admin' | 'alumni' | 'dormant';
const STATUSES: { value: Status; label: string }[] = [
  { value: '', label: '全部' },
  { value: 'active', label: '在用' },
  { value: 'admin', label: '管理员' },
  { value: 'alumni', label: '校友' },
  { value: 'dormant', label: '从未登录' },
  { value: 'disabled', label: '已停用' },
];

type Pending = { user: User; kind: 'status' | 'role' } | null;

function UserBadges({ user }: { user: User }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {user.is_admin && <Badge tone="accent">管理员</Badge>}
      {!isZju(user.email) && <Badge tone="brass">校友</Badge>}
      {!user.is_active && (
        <Badge tone="danger" dot>
          已停用
        </Badge>
      )}
    </span>
  );
}

function Members() {
  const { user: me } = useAuth();
  const params = useSearchParams();
  const [status, setStatus] = useState<Status>(() => {
    const s = params.get('status') as Status | null;
    return s && STATUSES.some((x) => x.value === s) ? s : '';
  });
  const [search, setSearch] = useState('');
  const query = useDebounced(search.trim(), 300);
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<User[] | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [detail, setDetail] = useState<User | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.admin.users({ page, per_page: 20, search: query, status });
      setUsers(res.users);
      setPagination(res.pagination);
      const missing = res.users.map((u) => u.id);
      if (missing.length) {
        api
          .avatars(missing)
          .then((r) =>
            setAvatars((prev) => {
              const next = { ...prev };
              for (const [id, a] of Object.entries(r.avatars)) next[id] = a.avatar_url;
              return next;
            }),
          )
          .catch(() => {});
      }
    } catch (err) {
      toast.error(explain(err).message);
      setUsers((u) => u ?? []);
    } finally {
      setLoading(false);
    }
  }, [page, query, status]);

  useEffect(() => {
    load();
  }, [load]);

  const replace = (next: User) => {
    setUsers((list) => list?.map((u) => (u.id === next.id ? next : u)) ?? null);
    setDetail((d) => (d?.id === next.id ? next : d));
  };

  const confirm = async () => {
    if (!pending) return;
    const { user, kind } = pending;
    const res = kind === 'status' ? await api.admin.setStatus(user.id, !user.is_active) : await api.admin.setRole(user.id, !user.is_admin);
    replace(res.user);
    toast.success(
      kind === 'status' ? (res.user.is_active ? `已恢复 ${user.name}` : `已停用 ${user.name}`) : res.user.is_admin ? `已将 ${user.name} 设为管理员` : `已取消 ${user.name} 的管理员权限`,
    );
  };

  return (
    <div>
      <PageHeader title="成员" />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between animate-rise">
        <Segmented
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={STATUSES}
        />
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="搜名字或邮箱"
          className="lg:w-72"
        />
      </div>

      <div className={cn('card overflow-hidden transition-opacity animate-rise [animation-delay:80ms]', loading && users && 'opacity-60')}>
        {users === null ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="skeleton h-12" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <Empty title="没有结果" />
        ) : (
          <table className="w-full text-left">
            <thead className="border-b border-line-soft text-[12px] text-fg-faint">
              <tr>
                <th className="px-4 py-3 font-normal sm:px-5">成员</th>
                <th className="hidden px-3 py-3 font-normal md:table-cell">加入</th>
                <th className="hidden px-3 py-3 font-normal sm:table-cell">最近登录</th>
                <th className="px-4 py-3 text-right font-normal sm:px-5">
                  <span className="sr-only">操作</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {users.map((u) => {
                const self = u.id === me?.id;
                return (
                  <tr key={u.id} className={cn('group transition-colors hover:bg-surface-2/60', !u.is_active && 'text-fg-faint')}>
                    <td className="px-4 py-3 sm:px-5">
                      <button type="button" onClick={() => setDetail(u)} className="flex min-w-0 items-center gap-3 text-left">
                        <Avatar name={u.name} src={avatars[u.id]} size={34} className={cn(!u.is_active && 'opacity-50')} />
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className={cn('text-[14px]', u.is_active ? 'text-fg' : 'text-fg-faint line-through decoration-line-strong')}>{u.name}</span>
                            {self && <span className="text-[12px] text-fg-ghost">（你）</span>}
                            <UserBadges user={u} />
                          </span>
                          <span className="mt-0.5 block truncate font-mono text-[12px] text-fg-faint">{u.email}</span>
                        </span>
                      </button>
                    </td>
                    <td className="hidden px-3 py-3 text-[13px] text-fg-soft md:table-cell tabular">{formatDate(u.created_at)}</td>
                    <td className="hidden px-3 py-3 text-[13px] text-fg-soft sm:table-cell">{u.last_login ? relativeTime(u.last_login) : <span className="text-fg-ghost">从未</span>}</td>
                    <td className="px-4 py-3 sm:px-5">
                      <div className="flex items-center justify-end gap-1">
                        {!self && (
                          <>
                            <IconAction
                              label={u.is_admin ? '取消管理员' : '设为管理员'}
                              onClick={() => setPending({ user: u, kind: 'role' })}
                              icon={u.is_admin ? <ShieldOff className="size-4" /> : <Shield className="size-4" />}
                            />
                            <IconAction
                              label={u.is_active ? '停用账号' : '恢复账号'}
                              danger={u.is_active}
                              onClick={() => setPending({ user: u, kind: 'status' })}
                              icon={u.is_active ? <UserX className="size-4" /> : <UserCheck className="size-4" />}
                            />
                          </>
                        )}
                        <IconAction label="查看详情" onClick={() => setDetail(u)} icon={<ChevronRight className="size-4" />} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {pagination && (
        <div className="mt-4 flex justify-end">
          <Pager page={pagination.page} pages={pagination.pages} total={pagination.total} onChange={setPage} />
        </div>
      )}

      <ConfirmDialog
        open={!!pending}
        onClose={() => setPending(null)}
        onConfirm={confirm}
        danger={pending?.kind === 'status' ? !!pending.user.is_active : !!pending?.user.is_admin}
        title={
          !pending
            ? ''
            : pending.kind === 'status'
              ? pending.user.is_active
                ? `停用 ${pending.user.name}？`
                : `恢复 ${pending.user.name}？`
              : pending.user.is_admin
                ? `取消 ${pending.user.name} 的管理员权限？`
                : `把 ${pending.user.name} 设为管理员？`
        }
        description={
          !pending
            ? null
            : pending.kind === 'status'
              ? pending.user.is_active
                ? '对方将无法登录任何服务。可随时恢复。'
                : '对方可以再次登录。'
              : pending.user.is_admin
                ? '对方将无法访问管理后台。'
                : '管理员可以管理成员、白名单和黑名单。'
        }
        confirmText={
          !pending ? '' : pending.kind === 'status' ? (pending.user.is_active ? '停用' : '恢复') : pending.user.is_admin ? '取消管理员' : '设为管理员'
        }
      />

      <MemberDrawer user={detail} avatar={detail ? avatars[detail.id] : null} onClose={() => setDetail(null)} onAction={(user, kind) => setPending({ user, kind })} self={detail?.id === me?.id} />
    </div>
  );
}

function IconAction({ label, icon, onClick, danger }: { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'flex size-8 items-center justify-center rounded-lg text-fg-ghost transition-colors hover:bg-surface-3',
        danger ? 'hover:text-danger' : 'hover:text-fg',
      )}
    >
      {icon}
    </button>
  );
}

function MemberDrawer({
  user,
  avatar,
  self,
  onClose,
  onAction,
}: {
  user: User | null;
  avatar?: string | null;
  self: boolean;
  onClose: () => void;
  onAction: (user: User, kind: 'status' | 'role') => void;
}) {
  // 记下这份数据属于谁，切换成员时旧数据自然作废
  const [loaded, setLoaded] = useState<{ id: number; logs: AuthLog[]; blacklisted: boolean } | null>(null);
  const id = user?.id;
  const logs = loaded && loaded.id === id ? loaded.logs : null;
  const blacklisted = !!(loaded && loaded.id === id && loaded.blacklisted);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    api.admin
      .user(id)
      .then((r) => alive && setLoaded({ id, logs: r.recent, blacklisted: r.user.is_blacklisted }))
      .catch(() => alive && setLoaded({ id, logs: [], blacklisted: false }));
    return () => {
      alive = false;
    };
  }, [id]);

  return (
    <Dialog open={!!user} onClose={onClose} side title={user?.name ?? ''} description={user ? <span className="font-mono text-[12.5px]">{user.email}</span> : null}>
      {user && (
        <div className="space-y-7 pb-4">
          <div className="flex items-center gap-4">
            <Avatar name={user.name} src={avatar} size={56} />
            <div className="space-y-1.5">
              <UserBadges user={user} />
              {blacklisted && <Badge tone="danger">已封禁</Badge>}
              <p className="font-mono text-[12px] text-fg-ghost">No.{memberNumber(user.id)}</p>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[12px] border border-line-soft bg-line-soft">
            {[
              ['加入', formatDate(user.created_at)],
              ['最近登录', user.last_login ? relativeTime(user.last_login) : '从未'],
            ].map(([k, v]) => (
              <div key={k} className="bg-surface p-3">
                <dt className="text-[12px] text-fg-faint">{k}</dt>
                <dd className="mt-1 text-[14px] text-fg">{v}</dd>
              </div>
            ))}
          </dl>

          {!self && (
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" className="flex-1" onClick={() => onAction(user, 'role')} icon={user.is_admin ? <ShieldOff className="size-4" /> : <Shield className="size-4" />}>
                {user.is_admin ? '取消管理员' : '设为管理员'}
              </Button>
              <Button
                size="sm"
                variant={user.is_active ? 'danger' : 'secondary'}
                className="flex-1"
                onClick={() => onAction(user, 'status')}
                icon={user.is_active ? <UserX className="size-4" /> : <UserCheck className="size-4" />}
              >
                {user.is_active ? '停用账号' : '恢复账号'}
              </Button>
            </div>
          )}

          <div>
            <SectionTitle>最近活动</SectionTitle>
            {logs ? (
              <ActivityList logs={logs} />
            ) : (
              <div className="skeleton h-40" />
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}

export default function UsersPage() {
  return (
    <Suspense>
      <Members />
    </Suspense>
  );
}
