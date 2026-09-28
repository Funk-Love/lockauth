'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useEntryParams } from '@/lib/entry';
import { explain } from '@/lib/errors';
import { emailError, isCode, isEmail, normalizeEmail, passwordError, passwordStrength } from '@/lib/validate';
import { Button } from '@/components/ui/Button';
import { CodeInput } from '@/components/ui/CodeInput';
import { FieldShell, PasswordField, StrengthMeter } from '@/components/ui/Field';
import { PanelHeading, useStage } from './EntranceShell';
import { EmailWithCode } from './EmailCode';
import { useFinish } from './useFinish';

type Errors = Partial<Record<'email' | 'code' | 'password' | 'form', string | null>>;

export function ResetForm() {
  const { redirectUri, next, email: presetEmail, link } = useEntryParams();
  const stage = useStage();
  const finish = useFinish();
  const [email, setEmail] = useState(presetEmail);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const steps = [isEmail(email), sent, isCode(code), password.length > 0, !passwordError(password)];
    stage.setProgress(steps.filter(Boolean).length);
  }, [email, sent, code, password, stage]);

  const clear = (key: keyof Errors) => setErrors((e) => (e[key] || e.form ? { ...e, [key]: null, form: null } : e));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found: Errors = {
      email: emailError(email),
      code: !sent ? '请先发送验证码' : isCode(code) ? null : '请输入 6 位验证码',
      password: passwordError(password),
    };
    setErrors(found);
    if (Object.values(found).some(Boolean)) {
      stage.fail();
      return;
    }
    setBusy(true);
    stage.setStatus('working');
    const cleanEmail = normalizeEmail(email);
    try {
      await api.resetPassword({ email: cleanEmail, password, code });
      const session = await api.login(cleanEmail, password, redirectUri);
      setDone(true);
      finish(session.token, session.user, { redirectUrl: session.redirect_url, next });
    } catch (err) {
      const { message, field } = explain(err);
      stage.fail();
      setErrors(field && ['email', 'code', 'password'].includes(field) ? { [field]: message } : { form: message });
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="py-6 animate-rise" role="status">
        <PanelHeading title="密码已重设" />
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <PanelHeading title="重设密码">我们会向你的注册邮箱发送验证码。</PanelHeading>

      <div className="space-y-1">
        <EmailWithCode
          purpose="reset_password"
          email={email}
          onEmail={setEmail}
          sent={sent}
          onSent={() => setSent(true)}
          error={errors.email}
          onClearError={() => clear('email')}
          autoFocus={!presetEmail}
        />

        <FieldShell label="验证码" htmlFor="reset-code" error={errors.code}>
          <CodeInput
            id="reset-code"
            value={code}
            onChange={(v) => {
              setCode(v);
              clear('code');
            }}
            onKeystroke={stage.tap}
            invalid={!!errors.code}
            disabled={!sent}
          />
        </FieldShell>

        <PasswordField
          label="新密码"
          name="new-password"
          autoComplete="new-password"
          placeholder="至少 6 位"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            clear('password');
            stage.tap();
          }}
          error={errors.password}
          hint={password ? <StrengthMeter score={passwordStrength(password)} /> : null}
        />
      </div>

      {errors.form && (
        <p role="alert" className="mb-4 rounded-[12px] border border-[oklch(0.71_0.14_27/0.25)] bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger animate-fade">
          {errors.form}
        </p>
      )}

      <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full" trailing={<ArrowRight className="size-4" />}>
        重设密码
      </Button>

      <p className="mt-6 text-center text-[13.5px] text-fg-faint">
        
        <Link
          href={link('/', { email: isEmail(email) ? normalizeEmail(email) : '' })}
          className="font-medium text-fg-soft underline decoration-line-strong underline-offset-4 transition-colors hover:text-accent-ink hover:decoration-accent-line"
        >
          返回登录
        </Link>
      </p>
    </form>
  );
}
