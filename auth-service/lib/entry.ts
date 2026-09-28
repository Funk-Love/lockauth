'use client';

import { useSearchParams } from 'next/navigation';

const SERVICE_BY_HOST: Record<string, string> = {
  'cloud.funk-and.love': 'LockCloud',
  'ai.funk-and.love': 'LockAI',
  'funk-and.love': 'Funk & Love 主页',
  'www.funk-and.love': 'Funk & Love 主页',
};

export function serviceFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    if (SERVICE_BY_HOST[host]) return SERVICE_BY_HOST[host];
    if (host === 'localhost' || host === '127.0.0.1') return '本地开发环境';
    return host;
  } catch {
    return null;
  }
}

/** 站内跳转只接受以 / 开头的相对路径，防止被拿来跳到外站 */
export function safeNext(next: string | null): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
  return next;
}

/** 入口页共用的参数：从哪个服务来、登录后回哪里 */
export function useEntryParams() {
  const params = useSearchParams();
  const redirectUri = params.get('redirect_uri');
  const next = safeNext(params.get('next'));
  const email = params.get('email') ?? '';
  const service = serviceFromUrl(redirectUri);

  /** 在入口页之间切换时带上同样的参数 */
  const link = (path: string, extra?: Record<string, string>) => {
    const q = new URLSearchParams();
    if (redirectUri) q.set('redirect_uri', redirectUri);
    if (next) q.set('next', next);
    for (const [k, v] of Object.entries(extra ?? {})) if (v) q.set(k, v);
    const qs = q.toString();
    return qs ? `${path}?${qs}` : path;
  };

  return { redirectUri, next, email, service, link };
}
