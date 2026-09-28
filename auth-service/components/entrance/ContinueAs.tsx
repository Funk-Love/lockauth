'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { api, type User } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useEntryParams } from '@/lib/entry';
import { explain } from '@/lib/errors';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/bits';
import { PanelHeading, useStage } from './EntranceShell';
import { useFinish } from './useFinish';

const AUTO_DELAY = 2200;

/** 已经登录的人从其他服务过来：不用再输密码，稍等一下自动带回去（可以取消换号） */
export function ContinueAs({ user, onSwitch }: { user: User; onSwitch: () => void }) {
  const router = useRouter();
  const { logout } = useAuth();
  const { redirectUri, next, service } = useEntryParams();
  const stage = useStage();
  const finish = useFinish();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auto, setAuto] = useState(!!redirectUri);
  const [avatar, setAvatar] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    stage.setProgress(5);
    api.myAvatar('avatarsm').then((r) => setAvatar(r.avatar_url)).catch(() => undefined);
  }, [stage]);

  const proceed = useCallback(async () => {
    if (started.current) return;
    started.current = true;
    setAuto(false);
    setError(null);
    if (!redirectUri) {
      router.push(next || '/dashboard');
      return;
    }
    setBusy(true);
    stage.setStatus('working');
    try {
      const res = await api.authorize(redirectUri);
      finish(res.token, user, { redirectUrl: res.redirect_url });
    } catch (err) {
      started.current = false;
      setBusy(false);
      stage.fail();
      setError(explain(err).message);
    }
  }, [redirectUri, next, router, stage, finish, user]);

  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(proceed, AUTO_DELAY);
    return () => clearTimeout(t);
  }, [auto, proceed]);

  return (
    <div>
      <PanelHeading title="你已登录">{service ? `即将前往 ${service}。` : null}</PanelHeading>

      <div className="mb-6 flex items-center gap-3.5 rounded-[16px] border border-line-soft bg-bg-deep/50 p-3.5">
        <Avatar name={user.name} src={avatar} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium text-fg">{user.name}</p>
          <p className="truncate text-[13px] text-fg-faint">{user.email}</p>
        </div>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-[12px] border border-[oklch(0.71_0.14_27/0.25)] bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">
          {error}
        </p>
      )}

      <Button variant="primary" size="lg" className="relative w-full overflow-hidden" loading={busy} onClick={proceed} trailing={<ArrowRight className="size-4" />}>
        {auto && (
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 bg-[oklch(0.17_0.006_62/0.08)]"
            style={{ animation: `grow ${AUTO_DELAY}ms linear forwards` }}
          />
        )}
        <span className="relative">{service ? '继续' : '进入控制台'}</span>
      </Button>
      <style>{'@keyframes grow{from{width:0}to{width:100%}}'}</style>

      <div className="mt-5 flex items-center justify-center gap-4 text-[13px] text-fg-faint">
        {auto && (
          <button className="transition-colors hover:text-fg" onClick={() => setAuto(false)}>
            取消
          </button>
        )}
        <button
          className="transition-colors hover:text-fg"
          onClick={() => {
            setAuto(false);
            logout();
            stage.setProgress(0);
            onSwitch();
          }}
        >
          使用其他账号
        </button>
      </div>
    </div>
  );
}
