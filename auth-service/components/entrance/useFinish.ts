'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useReducedMotion } from '@/lib/hooks';
import { useStage } from './EntranceShell';

/** 登录 / 注册 / 重置成功后的收尾：存会话、锁芯转过去定住、再离开 */
export function useFinish() {
  const router = useRouter();
  const { setSession } = useAuth();
  const stage = useStage();
  const reduced = useReducedMotion();

  return useCallback(
    (token: string, user: User, target: { redirectUrl?: string | null; next?: string | null }) => {
      setSession(token, user);
      stage.succeed();
      const go = () => {
        if (target.redirectUrl) window.location.assign(target.redirectUrl);
        else router.replace(target.next || '/dashboard');
      };
      // 留一拍给那个"定住"的瞬间
      setTimeout(go, reduced ? 150 : 950);
    },
    [router, setSession, stage, reduced],
  );
}
