'use client';

import { useEffect, useState } from 'react';
import { api, type AuthLog } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { explain } from '@/lib/errors';
import { passwordError, passwordStrength } from '@/lib/validate';
import { ActivityList } from '@/components/console/ActivityList';
import { PageHeader, SectionTitle } from '@/components/console/ConsoleShell';
import { Button } from '@/components/ui/Button';
import { PasswordField, StrengthMeter } from '@/components/ui/Field';
import { toast } from '@/components/ui/Toast';

export default function SecurityPage() {
  const { updateUser } = useAuth();
  const [logs, setLogs] = useState<AuthLog[] | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [errors, setErrors] = useState<{ current?: string | null; next?: string | null }>({});
  const [busy, setBusy] = useState(false);

  const load = () => api.activity(60).then((r) => setLogs(r.logs)).catch(() => setLogs([]));
  useEffect(() => {
    load();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found = {
      current: current ? null : '请输入当前密码',
      next: passwordError(next) ?? (next === current ? '新密码不能与当前密码相同' : null),
    };
    setErrors(found);
    if (found.current || found.next) return;
    setBusy(true);
    try {
      const res = await api.changePassword(current, next);
      updateUser(res.user, res.token);
      setCurrent('');
      setNext('');
      toast.success('密码已更新');
      load();
    } catch (err) {
      const { message, field } = explain(err);
      if (field === 'current_password') setErrors({ current: message });
      else if (field === 'new_password') setErrors({ next: message });
      else toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="登录与安全" description="更改密码后，其他设备将退出登录。" />

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <section className="card h-fit p-6 animate-rise">
          <SectionTitle>修改密码</SectionTitle>
          <form onSubmit={submit} noValidate className="space-y-1">
            <PasswordField
              label="当前密码"
              autoComplete="current-password"
              value={current}
              onChange={(e) => {
                setCurrent(e.target.value);
                setErrors((x) => ({ ...x, current: null }));
              }}
              error={errors.current}
            />
            <PasswordField
              label="新密码"
              autoComplete="new-password"
              placeholder="至少 6 位"
              value={next}
              onChange={(e) => {
                setNext(e.target.value);
                setErrors((x) => ({ ...x, next: null }));
              }}
              error={errors.next}
              hint={next ? <StrengthMeter score={passwordStrength(next)} /> : null}
            />
            <Button type="submit" variant="primary" className="w-full" loading={busy}>
              更新密码
            </Button>
          </form>
        </section>

        <section className="animate-rise [animation-delay:100ms]">
          <SectionTitle aside={<span className="text-[12px] text-fg-ghost">最近 180 天</span>}>活动记录</SectionTitle>
          <div className="card px-4 py-2 sm:px-5">{logs ? <ActivityList logs={logs} /> : <div className="skeleton my-3 h-64" />}</div>
        </section>
      </div>
    </div>
  );
}
