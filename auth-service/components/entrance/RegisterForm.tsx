'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useEntryParams } from '@/lib/entry';
import { explain } from '@/lib/errors';
import { emailError, isCode, isEmail, nameError, normalizeEmail, passwordError, passwordStrength } from '@/lib/validate';
import { Button } from '@/components/ui/Button';
import { CodeInput } from '@/components/ui/CodeInput';
import { FieldShell, PasswordField, StrengthMeter, TextField } from '@/components/ui/Field';
import { PanelHeading, useStage } from './EntranceShell';
import { EmailWithCode } from './EmailCode';
import { useFinish } from './useFinish';

type Errors = Partial<Record<'email' | 'code' | 'name' | 'password' | 'form', string | null>>;

export function RegisterForm() {
  const { redirectUri, next, email: presetEmail, service, link } = useEntryParams();
  const router = useRouter();
  const stage = useStage();
  const finish = useFinish();
  const [email, setEmail] = useState(presetEmail);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [welcome, setWelcome] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // 五颗弹子对应五步：邮箱、发码、填码、名字、密码
  useEffect(() => {
    const steps = [isEmail(email), sent, isCode(code), !nameError(name), !passwordError(password)];
    stage.setProgress(steps.filter(Boolean).length);
  }, [email, sent, code, name, password, stage]);

  const clear = (key: keyof Errors) => setErrors((e) => (e[key] || e.form ? { ...e, [key]: null, form: null } : e));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found: Errors = {
      email: emailError(email),
      code: !sent ? '请先发送验证码' : isCode(code) ? null : '请输入 6 位验证码',
      name: nameError(name),
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
    let registered = false;
    try {
      await api.register({ email: cleanEmail, password, name: name.trim(), code });
      registered = true;
      // 注册完直接登录，省得再输一遍
      const session = await api.login(cleanEmail, password, redirectUri);
      setWelcome(session.user.name);
      finish(session.token, session.user, { redirectUrl: session.redirect_url, next: nextPath() });
    } catch (err) {
      if (registered) {
        // 账号已经建好了，只是自动登录没成功：去登录页，别让人再注册一遍
        router.replace(link('/', { email: cleanEmail }));
        return;
      }
      const { message, field } = explain(err);
      stage.fail();
      setErrors(field && ['email', 'code', 'name', 'password'].includes(field) ? { [field]: message } : { form: message });
      setBusy(false);
    }
  };

  const nextPath = () => next || '/dashboard?welcome=1';

  if (welcome) {
    return (
      <div className="py-6 animate-rise" role="status">
        <PanelHeading title={`欢迎加入，${welcome}。`}>{service ? `正在前往 ${service}…` : null}</PanelHeading>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <PanelHeading title="创建账号">浙大邮箱可直接注册，校友邮箱需先加入白名单。</PanelHeading>

      <div className="space-y-1">
        <EmailWithCode
          purpose="register"
          email={email}
          onEmail={setEmail}
          sent={sent}
          onSent={() => setSent(true)}
          error={errors.email}
          onClearError={() => clear('email')}
          autoFocus
        />

        <div
          className={`grid transition-[grid-template-rows,opacity] duration-500 ease-[var(--ease-out)] ${sent ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
          aria-hidden={!sent}
        >
          <div className="overflow-hidden">
            <FieldShell label="验证码" htmlFor="register-code" error={errors.code}>
              <CodeInput
                id="register-code"
                value={code}
                onChange={(v) => {
                  setCode(v);
                  clear('code');
                }}
                onKeystroke={stage.tap}
                onComplete={() => nameRef.current?.focus()}
                invalid={!!errors.code}
                disabled={!sent}
              />
            </FieldShell>
          </div>
        </div>

        <TextField
          ref={nameRef}
          label="名字"
          name="name"
          autoComplete="name"
          value={name}
          maxLength={50}
          onChange={(e) => {
            setName(e.target.value);
            clear('name');
            stage.tap();
          }}
          error={errors.name}
        />
        <PasswordField
          label="密码"
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
        注册
      </Button>

      <p className="mt-6 text-center text-[13.5px] text-fg-faint">
        已有账号？{' '}
        <Link
          href={link('/', { email: isEmail(email) ? normalizeEmail(email) : '' })}
          className="font-medium text-fg-soft underline decoration-line-strong underline-offset-4 transition-colors hover:text-accent-ink hover:decoration-accent-line"
        >
          登录
        </Link>
      </p>
    </form>
  );
}
