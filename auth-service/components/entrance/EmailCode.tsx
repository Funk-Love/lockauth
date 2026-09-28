'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { explain } from '@/lib/errors';
import { useCountdown, useDebounced } from '@/lib/hooks';
import { emailError, isEmail, isZju, normalizeEmail } from '@/lib/validate';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { useStage } from './EntranceShell';

export type EmailState =
  | { kind: 'idle' }
  | { kind: 'zju' }
  | { kind: 'alumni'; name: string | null }
  | { kind: 'unknown' }
  | { kind: 'checking' };

interface Props {
  purpose: 'register' | 'reset_password';
  email: string;
  onEmail: (v: string) => void;
  sent: boolean;
  onSent: () => void;
  error?: string | null;
  onClearError: () => void;
  autoFocus?: boolean;
}

/** 邮箱 + "获取验证码"：注册时顺带看是不是浙大邮箱 / 校友白名单 */
export function EmailWithCode({ purpose, email, onEmail, sent, onSent, error, onClearError, autoFocus }: Props) {
  const stage = useStage();
  const [left, start] = useCountdown();
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [state, setState] = useState<EmailState>({ kind: 'idle' });
  const debounced = useDebounced(normalizeEmail(email), 450);

  // 注册时：非浙大邮箱去查一下白名单，早点告诉人家能不能注册
  useEffect(() => {
    if (purpose !== 'register' || !isEmail(debounced)) {
      setState({ kind: 'idle' });
      return;
    }
    if (isZju(debounced)) {
      setState({ kind: 'zju' });
      return;
    }
    let cancelled = false;
    setState({ kind: 'checking' });
    api
      .checkWhitelist(debounced)
      .then((r) => {
        if (cancelled) return;
        setState(r.is_whitelisted ? { kind: 'alumni', name: r.whitelist_info?.name ?? null } : { kind: 'unknown' });
      })
      .catch(() => !cancelled && setState({ kind: 'idle' }));
    return () => {
      cancelled = true;
    };
  }, [debounced, purpose]);

  const blocked = purpose === 'register' && state.kind === 'unknown';

  const send = async () => {
    const err = emailError(email);
    if (err) {
      setSendError(err);
      stage.fail();
      return;
    }
    if (blocked) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await api.sendCode(normalizeEmail(email), purpose);
      start(res.resend_after ?? 60);
      onSent();
      stage.tap();
    } catch (e) {
      const { message } = explain(e);
      setSendError(message);
      const retry = (e as { retryAfter?: number }).retryAfter;
      if (retry) start(retry);
      stage.fail();
    } finally {
      setSending(false);
    }
  };

  const hint = sent ? '验证码已发送，10 分钟内有效。' : null;
  const unknownMsg = blocked ? '此邮箱不在白名单中。校友请联系管理员添加。' : null;

  return (
    <TextField
      label="邮箱"
      type="email"
      name="email"
      autoComplete={purpose === 'register' ? 'email' : 'username'}
      inputMode="email"
      value={email}
      autoFocus={autoFocus}
      onChange={(e) => {
        onEmail(e.target.value);
        setSendError(null);
        onClearError();
        stage.tap();
      }}
      error={error ?? sendError ?? unknownMsg}
      hint={hint}
      className="pr-[7.5rem]"
      trailing={
        <Button
          size="sm"
          variant={sent ? 'ghost' : 'accent'}
          onClick={send}
          loading={sending}
          disabled={left > 0 || blocked || state.kind === 'checking'}
          className={cn('mr-0.5 min-w-[6.5rem] tabular')}
        >
          {left > 0 ? `${left} 秒后重发` : sent ? '重新发送' : '发送验证码'}
        </Button>
      }
    />
  );
}
