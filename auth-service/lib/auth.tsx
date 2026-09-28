'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, readToken, TOKEN_KEY, tokenExpiry, type User } from '@/lib/api';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: Status;
  user: User | null;
  token: string | null;
  /** 登录成功后调用：存 Token、记住用户 */
  setSession: (token: string, user: User) => void;
  /** 只更新用户信息（改名等），可顺带换新 Token */
  updateUser: (user: User, token?: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const DAY = 24 * 60 * 60 * 1000;

function store(token: string | null) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* 隐私模式等情况下存不了，就只活在内存里 */
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    store(null);
    setToken(null);
    setUser(null);
    setStatus('anonymous');
  }, []);

  const schedule = useCallback((current: string) => {
    if (timer.current) clearTimeout(timer.current);
    const exp = tokenExpiry(current);
    if (!exp) return;
    // 过期前一天换新；最少等一分钟，避免刚登录就连环刷新
    const wait = Math.max(60_000, Math.min(exp - Date.now() - DAY, 2_000_000_000));
    timer.current = setTimeout(async () => {
      try {
        const res = await api.refresh(current);
        store(res.token);
        setToken(res.token);
        setUser(res.user);
        schedule(res.token);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) clear();
      }
    }, wait);
  }, [clear]);

  const setSession = useCallback((next: string, nextUser: User) => {
    store(next);
    setToken(next);
    setUser(nextUser);
    setStatus('authenticated');
    schedule(next);
  }, [schedule]);

  const updateUser = useCallback((nextUser: User, next?: string) => {
    setUser(nextUser);
    if (next) {
      store(next);
      setToken(next);
      schedule(next);
    }
  }, [schedule]);

  // 启动：本地有 Token 就去核对一下；快过期的顺手换新
  useEffect(() => {
    let cancelled = false;
    const saved = readToken();
    if (!saved) {
      setStatus('anonymous');
      return;
    }
    (async () => {
      try {
        const exp = tokenExpiry(saved);
        if (exp && exp < Date.now()) throw new ApiError('AUTH_004', 'expired', 401);
        let current = saved;
        let me: User;
        if (exp && exp - Date.now() < 2 * DAY) {
          const res = await api.refresh(saved);
          current = res.token;
          me = res.user;
        } else {
          me = (await api.me(saved)).user;
        }
        if (cancelled) return;
        setSession(current, me);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) clear();
        else {
          // 网络问题：不清本地 Token，下次打开再核对，只是这次先按未登录显示
          setStatus('anonymous');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clear, setSession]);

  // 别的标签页登录 / 退出时同步
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== TOKEN_KEY) return;
      if (!e.newValue) clear();
      else api.me(e.newValue).then((res) => setSession(e.newValue as string, res.user)).catch(() => undefined);
    };
    const onUnauthorized = () => clear();
    window.addEventListener('storage', onStorage);
    window.addEventListener('lockauth:unauthorized', onUnauthorized);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('lockauth:unauthorized', onUnauthorized);
    };
  }, [clear, setSession]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, token, setSession, updateUser, logout: clear }),
    [status, user, token, setSession, updateUser, clear],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 需要放在 AuthProvider 里');
  return ctx;
}
