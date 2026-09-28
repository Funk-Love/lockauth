'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Ban,
  DoorOpen,
  Gauge,
  KeyRound,
  LogOut,
  Menu,
  ScrollText,
  UserRound,
  Users,
  UserRoundCheck,
  X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { Brand } from '@/components/brand/LockMark';
import { Avatar } from '@/components/ui/bits';
import { PageSpinner } from '@/components/ui/Spinner';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const PERSONAL: NavItem[] = [
  { href: '/dashboard', label: '首页', icon: DoorOpen },
  { href: '/dashboard/profile', label: '个人资料', icon: UserRound },
  { href: '/dashboard/security', label: '登录与安全', icon: KeyRound },
];

const ADMIN: NavItem[] = [
  { href: '/admin', label: '概览', icon: Gauge },
  { href: '/admin/users', label: '成员', icon: Users },
  { href: '/admin/whitelist', label: '校友白名单', icon: UserRoundCheck },
  { href: '/admin/blacklist', label: '黑名单', icon: Ban },
  { href: '/admin/logs', label: '操作日志', icon: ScrollText },
];

function isActive(pathname: string, href: string) {
  if (href === '/dashboard' || href === '/admin') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex h-10 items-center gap-3 rounded-[11px] px-3 text-[14px] transition-colors',
        active ? 'bg-surface-2 text-fg shadow-[var(--edge)]' : 'text-fg-faint hover:bg-surface/70 hover:text-fg-soft',
      )}
    >
      {/* 当前项左侧：两道并行细竖线 */}
      <span aria-hidden className={cn('absolute left-0 flex h-4 gap-[3px] transition-opacity', active ? 'opacity-100' : 'opacity-0')}>
        <span className="w-px bg-fg-soft" />
        <span className="w-px bg-accent" />
      </span>
      <Icon className={cn('size-[17px] shrink-0 transition-colors', active ? 'text-accent' : 'text-fg-ghost group-hover:text-fg-faint')} />
      {item.label}
    </Link>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  if (!user) return null;

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-6 pb-8">
        <Link href="/dashboard" onClick={onNavigate} className="rounded-lg">
          <Brand idle />
        </Link>
      </div>

      <nav className="flex-1 space-y-7 overflow-y-auto px-3" aria-label="控制台">
        <div className="space-y-1">
          {PERSONAL.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} onNavigate={onNavigate} />
          ))}
        </div>
        {user.is_admin && (
          <div className="space-y-1">
            <p className="px-3 pb-1.5 text-[11px] tracking-[0.24em] text-fg-ghost">管理</p>
            {ADMIN.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} onNavigate={onNavigate} />
            ))}
          </div>
        )}
      </nav>

      <div className="m-3 flex items-center gap-3 rounded-[14px] border border-line-soft bg-surface/60 p-2.5">
        <Avatar name={user.name} src={user.avatar_url} size={34} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-medium text-fg">{user.name}</p>
          <p className="truncate text-[11.5px] text-fg-faint">{user.email}</p>
        </div>
        <button
          onClick={() => {
            logout();
            router.replace('/');
          }}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg"
          aria-label="退出登录"
          title="退出登录"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * 控制台外壳：左侧栏 + 内容区。没登录会被送回登录页，
 * requireAdmin 的页面对非管理员直接回门厅。
 */
export function ConsoleShell({ children, requireAdmin = false }: { children: React.ReactNode; requireAdmin?: boolean }) {
  const { status, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // 抽屉记住是在哪个页面打开的，换了页面自然就收起
  const [drawerAt, setDrawerAt] = useState<string | null>(null);
  const drawer = drawerAt === pathname;
  const setDrawer = (open: boolean) => setDrawerAt(open ? pathname : null);

  useEffect(() => {
    if (status === 'anonymous') router.replace(`/?next=${encodeURIComponent(pathname)}`);
    else if (status === 'authenticated' && requireAdmin && user && !user.is_admin) router.replace('/dashboard');
  }, [status, user, requireAdmin, router, pathname]);

  if (status !== 'authenticated' || !user || (requireAdmin && !user.is_admin)) {
    return (
      <div className="min-h-dvh bg-bg">
        <PageSpinner />
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh bg-bg lg:flex">
      {/* 背景：左上一点暖光，右下一点铜绿，都很淡 */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(60% 50% at 20% -10%, oklch(0.25 0.02 70 / 0.55), transparent 70%), radial-gradient(40% 40% at 100% 100%, oklch(0.35 0.04 176 / 0.1), transparent 70%)',
        }}
      />

      <aside className="sticky top-0 z-20 hidden h-dvh w-[252px] shrink-0 border-r border-line-soft bg-bg-deep/70 backdrop-blur-xl lg:block">
        <Sidebar />
      </aside>

      {/* 手机顶栏 */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line-soft bg-bg/80 px-4 backdrop-blur-xl lg:hidden">
        <Link href="/dashboard">
          <Brand />
        </Link>
        <button
          onClick={() => setDrawer(true)}
          className="flex size-9 items-center justify-center rounded-lg text-fg-soft hover:bg-surface-2"
          aria-label="打开菜单"
        >
          <Menu className="size-5" />
        </button>
      </header>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-[oklch(0.08_0.005_60/0.6)] backdrop-blur-[2px] animate-fade" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-[280px] border-r border-line-soft bg-bg-deep animate-rise">
            <button
              onClick={() => setDrawer(false)}
              className="absolute top-5 right-3 flex size-8 items-center justify-center rounded-lg text-fg-faint hover:bg-surface-2"
              aria-label="关闭菜单"
            >
              <X className="size-4" />
            </button>
            <Sidebar onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}

      <main className="relative z-10 min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1120px] px-5 pt-8 pb-16 sm:px-8 lg:px-12 lg:pt-12">{children}</div>
      </main>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between animate-rise">
      <div className="space-y-2.5">
        {eyebrow && <p className="text-[12px] tracking-[0.2em] text-fg-faint">{eyebrow}</p>}
        <h1 className="font-serif-sc text-[28px] leading-tight font-semibold text-fg sm:text-[32px]">{title}</h1>
        {description && <p className="max-w-xl text-[14px] leading-relaxed text-fg-soft">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
}

/** 控制台里的分区标题 */
export function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-3.5 flex items-baseline justify-between gap-3">
      <h2 className="text-[13px] font-medium tracking-[0.12em] text-fg-faint">{children}</h2>
      {aside}
    </div>
  );
}
