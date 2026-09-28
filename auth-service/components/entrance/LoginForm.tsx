'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useEntryParams } from '@/lib/entry';
import { explain } from '@/lib/errors';
import { emailError, isEmail, normalizeEmail, passwordError } from '@/lib/validate';
import { Button } from '@/components/ui/Button';
import { PasswordField, TextField } from '@/components/ui/Field';
import { PageSpinner } from '@/components/ui/Spinner';
import { PanelHeading, useStage } from './EntranceShell';
import { ContinueAs } from './ContinueAs';
import { useFinish } from './useFinish';

export function LoginForm() {
  const { status, user } = useAuth();
  // 只在刚打开页面、核对完本地登录态的那一刻决定显示哪种；
  // 之后在本页登录成功时状态也会变成已登录，不能因此切到"继续"卡片
  const [mode, setMode] = useState<'pending' | 'continue' | 'form'>('pending');

  if (mode === 'pending' && status !== 'loading') setMode(status === 'authenticated' ? 'continue' : 'form');

  if (mode === 'pending') return <PageSpinner />;
  if (mode === 'continue' && user) return <ContinueAs user={user} onSwitch={() => setMode('form')} />;
  return <Credentials />;
}

function Credentials() {
  const { redirectUri, next, email: presetEmail, service, link } = useEntryParams();
  const stage = useStage();
  const finish = useFinish();
  const [email, setEmail] = useState(presetEmail);
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({});
  const [errors, setErrors] = useState<{ email?: string | null; password?: string | null; form?: string | null }>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // 邮箱对了顶上两颗弹子，开始输密码第三颗，密码够长后五颗全部归位、锁芯转开
  useEffect(() => {
    const pw = password.length === 0 ? 0 : password.length < 6 ? 1 : 3;
    const n = busy || done ? 5 : (isEmail(email) ? 2 : 0) + pw;
    stage.setProgress(n);
  }, [email, password, busy, done, stage]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const eErr = emailError(email);
    const pErr = password ? null : passwordError(password);
    setTouched({ email: true, password: true });
    setErrors({ email: eErr, password: pErr });
    if (eErr || pErr) {
      stage.fail();
      return;
    }
    setBusy(true);
    stage.setStatus('working');
    try {
      const res = await api.login(normalizeEmail(email), password, redirectUri);
      setDone(res.user.name);
      finish(res.token, res.user, { redirectUrl: res.redirect_url, next });
    } catch (err) {
      const { message, field } = explain(err);
      stage.fail();
      if (field === 'password' || field === 'email') setErrors({ [field]: message });
      else setErrors({ form: message });
      if (field === 'password') {
        setPassword('');
        passwordRef.current?.focus();
      }
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="py-6 animate-rise" role="status">
        <PanelHeading title={`欢迎回来，${done}。`}>{service ? `正在前往 ${service}…` : null}</PanelHeading>
        <div className="h-px w-full overflow-hidden bg-line">
          <div className="h-full w-full animate-[shimmer_1.4s_linear_infinite] bg-[linear-gradient(90deg,transparent,var(--accent),transparent)] bg-size-[200%_100%]" />
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <PanelHeading title="登录">
        {service ? `登录以继续使用 ${service}。` : '使用你的 Funk & Love 账号登录。'}
      </PanelHeading>

      <div className="space-y-1">
        <TextField
          label="邮箱"
          type="email"
          name="email"
          autoComplete="username"
          inputMode="email"
          value={email}
          autoFocus={!presetEmail}
          onChange={(e) => {
            setEmail(e.target.value);
            stage.tap();
            if (errors.email || errors.form) setErrors({});
          }}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          error={errors.email ?? (touched.email && email ? emailError(email) : null)}
        />
        <PasswordField
          ref={passwordRef}
          label="密码"
          name="password"
          autoComplete="current-password"
          value={password}
          autoFocus={!!presetEmail}
          onChange={(e) => {
            setPassword(e.target.value);
            stage.tap();
            if (errors.password || errors.form) setErrors({});
          }}
          error={errors.password}
          aside={
            <Link href={link('/reset-password', { email: isEmail(email) ? normalizeEmail(email) : '' })} className="text-[12.5px] text-fg-faint transition-colors hover:text-accent-ink">
              忘记密码？
            </Link>
          }
        />
      </div>

      {errors.form && (
        <p role="alert" className="mb-4 rounded-[12px] border border-[oklch(0.71_0.14_27/0.25)] bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger animate-fade">
          {errors.form}
        </p>
      )}

      <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full" trailing={<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />}>
        登录
      </Button>

      <p className="mt-6 text-center text-[13.5px] text-fg-faint">
        没有账号？{' '}
        <Link href={link('/register')} className="font-medium text-fg-soft underline decoration-line-strong underline-offset-4 transition-colors hover:text-accent-ink hover:decoration-accent-line">
          注册
        </Link>
      </p>
    </form>
  );
}
