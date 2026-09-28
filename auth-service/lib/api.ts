/**
 * 后端接口。所有请求都走这里：自动带上 Token，错误统一成 ApiError。
 */

export const TOKEN_KEY = 'auth_token';

export const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'development' ? 'http://localhost:5000/api' : '/api')
).replace(/\/$/, '');

// ---------------------------------------------------------------- 类型

export interface User {
  id: number;
  email: string;
  name: string;
  created_at: string;
  last_login: string | null;
  is_active: boolean;
  is_admin: boolean;
  avatar_url?: string | null;
}

export interface AuthLog {
  id: number;
  action: string;
  ip_address: string | null;
  user_agent: string | null;
  success: boolean;
  error_code: string | null;
  error_message: string | null;
  service: string | null;
  created_at: string;
  user_id?: number | null;
  email?: string | null;
  user_name?: string | null;
  detail?: Record<string, unknown> | null;
}

export interface Pagination {
  page: number;
  per_page: number;
  total: number;
  pages: number;
}

export interface Activity {
  logs: AuthLog[];
  services: Record<string, string>;
  stats: { logins_30d: number; member_days: number; is_alumni: boolean };
}

export interface Overview {
  users: {
    total: number;
    active: number;
    disabled: number;
    admins: number;
    alumni: number;
    never_logged_in: number;
    new_30d: number;
    active_7d: number;
    active_30d: number;
  };
  whitelist: { total: number; registered: number };
  blacklist: { total: number };
  registrations: { month: string; count: number }[];
  registrations_before: number;
  daily_active: { date: string; users: number }[];
  services: Record<string, number>;
  failed_logins_24h: number;
  tracking_since: string | null;
}

export interface WhitelistEntry {
  id: number;
  email: string;
  name: string | null;
  note: string | null;
  added_by: number;
  added_at: string;
  adder: { id: number; name: string; email: string } | null;
  registered: boolean;
}

export interface BlacklistEntry {
  id: number;
  email: string;
  reason: string | null;
  blocked_by: number;
  blocked_at: string;
  blocker: { id: number; name: string; email: string } | null;
}

export interface AvatarResult {
  success: boolean;
  has_avatar: boolean;
  avatar_url: string | null;
}

// ---------------------------------------------------------------- 请求

export class ApiError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;

  constructor(code: string, message: string, status: number, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }

  get field(): string | undefined {
    const f = this.details?.field;
    return typeof f === 'string' ? f : undefined;
  }

  get retryAfter(): number | undefined {
    const r = this.details?.retry_after;
    return typeof r === 'number' ? r : undefined;
  }
}

export function readToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  /** 不传就用本地存的；传 null 表示不带 */
  token?: string | null;
  signal?: AbortSignal;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, signal } = options;
  const token = options.token === undefined ? readToken() : options.token;

  let url = `${API_BASE}${path}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      credentials: 'omit',
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
    throw new ApiError('NETWORK_ERROR', '无法连接网络', 0);
  }

  let data: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: Record<string, unknown> } })?.error;
    const apiError = new ApiError(
      err?.code || `HTTP_${response.status}`,
      err?.message || (response.status >= 500 ? '服务暂时不可用，请稍后再试' : '请求失败'),
      response.status,
      err?.details,
    );
    if (response.status === 401 && token && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('lockauth:unauthorized', { detail: apiError }));
    }
    throw apiError;
  }
  return data as T;
}

// ---------------------------------------------------------------- 认证

export interface SessionResponse {
  success: boolean;
  message: string;
  token: string;
  user: User;
  redirect_url?: string;
}

export const api = {
  login: (email: string, password: string, redirect_uri?: string | null) =>
    request<SessionResponse>('/auth/login', {
      method: 'POST',
      body: { email, password, redirect_uri: redirect_uri || undefined },
      token: null,
    }),

  sendCode: (email: string, purpose: 'register' | 'reset_password') =>
    request<{ success: boolean; expires_in: number; resend_after?: number; is_whitelisted?: boolean }>(
      '/auth/send-code',
      { method: 'POST', body: { email, purpose }, token: null },
    ),

  checkWhitelist: (email: string) =>
    request<{
      success: boolean;
      is_whitelisted: boolean;
      is_zju_email?: boolean;
      whitelist_info?: { name: string | null; note: string | null };
    }>('/auth/check-whitelist', { method: 'POST', body: { email }, token: null }),

  register: (data: { email: string; password: string; name: string; code: string; redirect_uri?: string | null }) =>
    request<{ success: boolean; message: string; user: User; redirect_url?: string }>('/auth/register', {
      method: 'POST',
      body: { ...data, redirect_uri: data.redirect_uri || undefined },
      token: null,
    }),

  resetPassword: (data: { email: string; password: string; code: string }) =>
    request<{ success: boolean; message: string }>('/auth/reset-password', { method: 'POST', body: data, token: null }),

  me: (token?: string | null) => request<{ success: boolean; user: User }>('/auth/me', { token }),

  refresh: (token?: string | null) => request<SessionResponse>('/auth/refresh', { method: 'POST', token }),

  authorize: (redirect_uri: string) =>
    request<{ success: boolean; redirect_url: string; service: string | null; token: string }>('/auth/sso/authorize', {
      method: 'POST',
      body: { redirect_uri },
    }),

  myAvatar: (style: 'avatarsm' | 'avatarmd' | 'avatarlg' = 'avatarmd') =>
    request<AvatarResult>('/auth/me/avatar', { query: { style } }),

  avatars: (user_ids: number[], style: 'avatarsm' | 'avatarmd' = 'avatarsm') =>
    request<{ success: boolean; avatars: Record<string, AvatarResult> }>('/auth/avatars', {
      method: 'POST',
      body: { user_ids, style },
    }),

  avatarUploadUrl: (content_type: string, size: number) =>
    request<{ success: boolean; upload_url: string; key: string; headers: Record<string, string> }>(
      '/auth/me/avatar/upload-url',
      { method: 'POST', body: { content_type, size } },
    ),

  confirmAvatar: (key: string) =>
    request<{ success: boolean; user: User }>('/auth/me/avatar', { method: 'POST', body: { key } }),

  removeAvatar: () => request<{ success: boolean; user: User }>('/auth/me/avatar', { method: 'DELETE' }),

  updateProfile: (name: string) =>
    request<{ success: boolean; user: User; token: string }>('/auth/me', { method: 'PATCH', body: { name } }),

  changePassword: (current_password: string, new_password: string) =>
    request<{ success: boolean; message: string; token: string; user: User }>('/auth/me/password', {
      method: 'POST',
      body: { current_password, new_password },
    }),

  activity: (limit = 30) => request<{ success: boolean } & Activity>('/auth/me/activity', { query: { limit } }),

  // -------------------------------------------------------------- 管理
  admin: {
    overview: () => request<{ success: boolean } & Overview>('/admin/overview'),

    users: (q: { page?: number; per_page?: number; search?: string; status?: string }) =>
      request<{ success: boolean; users: User[]; pagination: Pagination }>('/admin/users', { query: q }),

    user: (id: number) =>
      request<{ success: boolean; user: User & { is_blacklisted: boolean }; recent: AuthLog[] }>(`/admin/users/${id}`),

    setStatus: (id: number, is_active: boolean) =>
      request<{ success: boolean; user: User }>(`/admin/users/${id}/status`, { method: 'PUT', body: { is_active } }),

    setRole: (id: number, is_admin: boolean) =>
      request<{ success: boolean; user: User }>(`/admin/users/${id}/role`, { method: 'PUT', body: { is_admin } }),

    whitelist: (q: { page?: number; per_page?: number; search?: string }) =>
      request<{ success: boolean; whitelist: WhitelistEntry[]; pagination: Pagination }>('/admin/whitelist', { query: q }),

    addWhitelist: (data: { email: string; name?: string; note?: string }) =>
      request<{ success: boolean; whitelist: WhitelistEntry }>('/admin/whitelist', { method: 'POST', body: data }),

    updateWhitelist: (id: number, data: { name?: string; note?: string }) =>
      request<{ success: boolean; whitelist: WhitelistEntry }>(`/admin/whitelist/${id}`, { method: 'PUT', body: data }),

    removeWhitelist: (id: number) =>
      request<{ success: boolean }>(`/admin/whitelist/${id}`, { method: 'DELETE' }),

    blacklist: (q: { page?: number; per_page?: number }) =>
      request<{ success: boolean; blacklist: BlacklistEntry[]; pagination: Pagination }>('/admin/blacklist', { query: q }),

    addBlacklist: (data: { email: string; reason?: string }) =>
      request<{ success: boolean; blacklist: BlacklistEntry }>('/admin/blacklist', { method: 'POST', body: data }),

    removeBlacklist: (email: string) =>
      request<{ success: boolean }>(`/admin/blacklist/${encodeURIComponent(email)}`, { method: 'DELETE' }),

    logs: (q: { page?: number; per_page?: number; action?: string; search?: string; result?: string; user_id?: number }) =>
      request<{ success: boolean; logs: AuthLog[]; pagination: Pagination }>('/admin/logs', { query: q }),
  },
};

/** 读 JWT 的过期时间（毫秒），读不出返回 null */
export function tokenExpiry(token: string): number | null {
  try {
    const part = token.split('.')[1];
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json) as { exp?: number };
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}
