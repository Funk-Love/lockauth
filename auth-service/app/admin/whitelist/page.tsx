'use client';

import { useCallback, useEffect, useState } from 'react';
import { PenLine, Plus, Trash2 } from 'lucide-react';
import { api, type Pagination, type WhitelistEntry } from '@/lib/api';
import { explain } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import { emailError, isZju, normalizeEmail } from '@/lib/validate';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/console/ConsoleShell';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { FieldShell, inputClass, TextField } from '@/components/ui/Field';
import { Badge, Empty, Pager, SearchInput } from '@/components/ui/bits';
import { toast } from '@/components/ui/Toast';

type Editing = { mode: 'add' } | { mode: 'edit'; entry: WhitelistEntry } | null;

export default function WhitelistPage() {
  const [search, setSearch] = useState('');
  const query = useDebounced(search.trim(), 300);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<WhitelistEntry[] | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [removing, setRemoving] = useState<WhitelistEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.admin.whitelist({ page, per_page: 20, search: query });
      setItems(res.whitelist);
      setPagination(res.pagination);
    } catch (err) {
      toast.error(explain(err).message);
      setItems((x) => x ?? []);
    } finally {
      setLoading(false);
    }
  }, [page, query]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="校友白名单"
        description="白名单中的非浙大邮箱可以注册。"
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing({ mode: 'add' })}>
            添加校友
          </Button>
        }
      />

      <div className="mb-4 animate-rise">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="搜邮箱或名字"
          className="sm:w-72"
        />
      </div>

      <div className={cn('card overflow-hidden transition-opacity animate-rise [animation-delay:80ms]', loading && items && 'opacity-60')}>
        {items === null ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="skeleton h-12" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <Empty title={query ? '没有结果' : '白名单为空'} />
        ) : (
          <ul className="divide-y divide-line-soft">
            {items.map((e) => (
              <li key={e.id} className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[13.5px] text-fg">{e.email}</span>
                    {e.registered ? <Badge tone="accent">已注册</Badge> : <Badge>未注册</Badge>}
                  </div>
                  <p className="mt-1 truncate text-[12.5px] text-fg-faint">
                    {e.name && <span className="text-fg-soft">{e.name}</span>}
                    {e.name && e.note && ' · '}
                    {e.note}
                  </p>
                </div>
                <p className="shrink-0 text-[12px] text-fg-ghost">
                  {e.adder ? `${e.adder.name} 添加于 ` : ''}
                  <span className="tabular">{formatDate(e.added_at)}</span>
                </p>
                <div className="flex shrink-0 gap-1 sm:-mr-2">
                  <Button size="sm" variant="ghost" icon={<PenLine className="size-3.5" />} onClick={() => setEditing({ mode: 'edit', entry: e })}>
                    编辑
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => setRemoving(e)} className="hover:text-danger">
                    移除
                  </Button>
                </div>
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

      <WhitelistDialog editing={editing} onClose={() => setEditing(null)} onSaved={load} />

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        danger
        title={`移除 ${removing?.email ?? ''}？`}
        description={removing?.registered ? '已注册的账号不受影响。' : '此邮箱将无法注册。'}
        confirmText="移除"
        onConfirm={async () => {
          if (!removing) return;
          await api.admin.removeWhitelist(removing.id);
          toast.success('已移除');
          await load();
        }}
      />
    </div>
  );
}

function WhitelistDialog({ editing, onClose, onSaved }: { editing: Editing; onClose: () => void; onSaved: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const entry = editing?.mode === 'edit' ? editing.entry : null;

  useEffect(() => {
    if (!editing) return;
    setEmail(entry?.email ?? '');
    setName(entry?.name ?? '');
    setNote(entry?.note ?? '');
    setError(null);
  }, [editing, entry]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entry) {
      const clean = normalizeEmail(email);
      const err = emailError(clean) ?? (isZju(clean) ? '浙大邮箱无需加入白名单' : null);
      setError(err);
      if (err) return;
    }
    setBusy(true);
    try {
      if (entry) await api.admin.updateWhitelist(entry.id, { name, note });
      else await api.admin.addWhitelist({ email: normalizeEmail(email), name, note });
      toast.success(entry ? '已保存' : '已加入白名单');
      onSaved();
      onClose();
    } catch (err) {
      const x = explain(err);
      if (x.field === 'email') setError(x.message);
      else toast.error(x.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={!!editing}
      onClose={() => !busy && onClose()}
      title={entry ? '编辑白名单' : '添加校友'}
      description={entry ? <span className="font-mono text-[12.5px]">{entry.email}</span> : undefined}
    >
      <form onSubmit={submit} noValidate className="pb-3">
        {!entry && (
          <TextField
            label="邮箱"
            type="email"
            autoComplete="off"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            error={error}
          />
        )}
        <TextField label="名字" placeholder="可选" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        <FieldShell label="备注" htmlFor="wl-note">
          <textarea
            id="wl-note"
            rows={3}
            maxLength={500}
            placeholder="可选"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={cn(inputClass(false), 'h-auto resize-none py-2.5 leading-relaxed')}
          />
        </FieldShell>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            {entry ? '保存' : '加入白名单'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
