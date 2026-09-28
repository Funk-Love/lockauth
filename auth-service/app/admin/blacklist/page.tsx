'use client';

import { useCallback, useEffect, useState } from 'react';
import { Ban, Undo2 } from 'lucide-react';
import { api, type BlacklistEntry, type Pagination } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { explain } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { emailError, normalizeEmail } from '@/lib/validate';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/console/ConsoleShell';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { FieldShell, inputClass, TextField } from '@/components/ui/Field';
import { Empty, Pager } from '@/components/ui/bits';
import { toast } from '@/components/ui/Toast';

export default function BlacklistPage() {
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<BlacklistEntry[] | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<BlacklistEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.admin.blacklist({ page, per_page: 20 });
      setItems(res.blacklist);
      setPagination(res.pagination);
    } catch (err) {
      toast.error(explain(err).message);
      setItems((x) => x ?? []);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="黑名单"
        description="黑名单中的邮箱无法注册或登录。"
        actions={
          <Button variant="secondary" icon={<Ban className="size-4" />} onClick={() => setAdding(true)}>
            封禁邮箱
          </Button>
        }
      />

      <div className={cn('card overflow-hidden transition-opacity animate-rise', loading && items && 'opacity-60')}>
        {items === null ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="skeleton h-12" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <Empty title="黑名单为空" />
        ) : (
          <ul className="divide-y divide-line-soft">
            {items.map((e) => (
              <li key={e.id} className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[13.5px] text-fg">{e.email}</p>
                  <p className="mt-1 truncate text-[12.5px] text-fg-faint">{e.reason}</p>
                </div>
                <p className="shrink-0 text-[12px] text-fg-ghost">
                  {e.blocker ? `${e.blocker.name} 封禁于 ` : ''}
                  <span className="tabular">{formatDate(e.blocked_at)}</span>
                </p>
                <Button size="sm" variant="ghost" icon={<Undo2 className="size-3.5" />} onClick={() => setRemoving(e)} className="shrink-0 sm:-mr-2">
                  解除
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pagination && (
        <div className="mt-4 flex justify-end">
          <Pager page={pagination.page} pages={pagination.pages} total={pagination.total} onChange={setPage} />
        </div>
      )}

      <AddDialog open={adding} onClose={() => setAdding(false)} onSaved={load} />

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="解除封禁？"
        description="该邮箱将可以再次注册和登录。"
        confirmText="解除"
        onConfirm={async () => {
          if (!removing) return;
          await api.admin.removeBlacklist(removing.email);
          toast.success('已解除');
          await load();
        }}
      />
    </div>
  );
}

function AddDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEmail('');
    setReason('');
    setError(null);
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = normalizeEmail(email);
    const err = emailError(clean) ?? (clean === user?.email ? '不能封禁自己的邮箱' : null);
    setError(err);
    if (err) return;
    setBusy(true);
    try {
      await api.admin.addBlacklist({ email: clean, reason });
      toast.success('已封禁');
      onSaved();
      onClose();
    } catch (err2) {
      const x = explain(err2);
      if (x.field === 'email') setError(x.message);
      else toast.error(x.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} title="封禁邮箱" description="对应的账号将无法登录。">
      <form onSubmit={submit} noValidate className="pb-3">
        <TextField
          label="邮箱"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          error={error}
        />
        <FieldShell label="原因" htmlFor="bl-reason">
          <textarea
            id="bl-reason"
            rows={3}
            maxLength={500}
            placeholder="可选"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={cn(inputClass(false), 'h-auto resize-none py-2.5 leading-relaxed')}
          />
        </FieldShell>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button type="submit" variant="danger" loading={busy}>
            封禁
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
