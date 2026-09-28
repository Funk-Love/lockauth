/** 时间、设备、操作名等的展示格式。后端给的时间是不带时区的 UTC。 */

export function parseUtc(value: string | null | undefined): Date | null {
  if (!value) return null;
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(' ', 'T')}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function formatDate(value: string | null | undefined, withTime = false): string {
  const d = parseUtc(value);
  if (!d) return '—';
  const date = `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
  return withTime ? `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}` : date;
}

export function formatTime(value: string | null | undefined): string {
  const d = parseUtc(value);
  return d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '';
}

export function relativeTime(value: string | null | undefined, now = Date.now()): string {
  const d = parseUtc(value);
  if (!d) return '从未';
  const diff = Math.max(0, now - d.getTime());
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < min) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / min)} 分钟前`;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  if (d.getTime() >= today.getTime()) return `${Math.floor(diff / hour)} 小时前`;
  if (d.getTime() >= today.getTime() - day) return `昨天 ${formatTime(value)}`;
  if (diff < 7 * day) return `${Math.ceil((today.getTime() - d.getTime()) / day)} 天前`;
  if (d.getFullYear() === today.getFullYear()) return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
  return formatDate(value);
}

/** 按当地时间打招呼 */
export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h >= 5 && h < 11) return '早上好';
  if (h >= 11 && h < 13) return '中午好';
  if (h >= 13 && h < 18) return '下午好';
  return '晚上好';
}

export function initials(name: string | null | undefined): string {
  const n = (name || '').trim();
  if (!n) return '·';
  if (/^[一-鿿]/.test(n)) return n.length >= 3 ? n.slice(-2) : n.slice(-1);
  const parts = n.split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

export interface Device {
  label: string;
  kind: 'desktop' | 'mobile' | 'tablet' | 'unknown';
}

export function parseUserAgent(ua: string | null | undefined): Device {
  if (!ua) return { label: '未知设备', kind: 'unknown' };
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /HarmonyOS|OpenHarmony/.test(ua)
          ? '鸿蒙'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'Mac'
            : /Windows/.test(ua)
              ? 'Windows'
              : /Linux/.test(ua)
                ? 'Linux'
                : '';
  const browser = /MicroMessenger/.test(ua)
    ? '微信'
    : /DingTalk/.test(ua)
      ? '钉钉'
      : /Edg\//.test(ua)
        ? 'Edge'
        : /OPR\/|Opera/.test(ua)
          ? 'Opera'
          : /Firefox\//.test(ua)
            ? 'Firefox'
            : /Chrome\//.test(ua)
              ? 'Chrome'
              : /Safari\//.test(ua)
                ? 'Safari'
                : /python|httpx|curl|axios|node/i.test(ua)
                  ? '服务调用'
                  : '';
  const kind: Device['kind'] = /iPad|Tablet/.test(ua)
    ? 'tablet'
    : /Mobile|iPhone|Android/.test(ua)
      ? 'mobile'
      : os
        ? 'desktop'
        : 'unknown';
  const label = [os, browser].filter(Boolean).join(' · ') || '未知设备';
  return { label, kind };
}

export function maskIp(ip: string | null | undefined): string {
  if (!ip) return '—';
  if (ip.includes('.')) {
    const parts = ip.split('.');
    return parts.length === 4 ? `${parts[0]}.${parts[1]}.*.${parts[3]}` : ip;
  }
  const parts = ip.split(':');
  return parts.length > 3 ? `${parts.slice(0, 3).join(':')}:…` : ip;
}

const ACTIONS: Record<string, string> = {
  login: '登录',
  register: '注册',
  reset_password: '重置密码',
  change_password: '修改密码',
  update_profile: '修改资料',
  sso_authorize: '授权登录',
  service_access: '访问服务',
  'admin.enable_user': '恢复账号',
  'admin.disable_user': '停用账号',
  'admin.grant_admin': '设为管理员',
  'admin.revoke_admin': '取消管理员',
  'admin.blacklist_add': '封禁邮箱',
  'admin.blacklist_remove': '解除封禁',
  'admin.whitelist_add': '加入白名单',
  'admin.whitelist_update': '修改白名单',
  'admin.whitelist_remove': '移出白名单',
};

export function actionLabel(action: string, success = true): string {
  const base = ACTIONS[action] ?? action;
  return success ? base : `${base}失败`;
}

export const SERVICE_META: Record<string, { name: string; tint: string }> = {
  cloud: { name: 'LockCloud', tint: 'var(--brass)' },
  ai: { name: 'LockAI', tint: 'var(--amber)' },
  main: { name: '主页', tint: 'var(--fg-soft)' },
  auth: { name: 'LockAuth', tint: 'var(--accent)' },
  local: { name: '本地开发', tint: 'var(--fg-faint)' },
};

export function serviceName(key: string | null | undefined): string | null {
  if (!key) return null;
  return SERVICE_META[key]?.name ?? key;
}

export function memberNumber(id: number): string {
  return String(id).padStart(4, '0');
}
