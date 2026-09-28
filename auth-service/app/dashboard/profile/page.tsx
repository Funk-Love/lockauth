'use client';

import { useRef, useState } from 'react';
import { Camera, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { explain } from '@/lib/errors';
import { formatDate, memberNumber, relativeTime } from '@/lib/format';
import { isZju, nameError } from '@/lib/validate';
import { PageHeader, SectionTitle } from '@/components/console/ConsoleShell';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { Avatar, Badge } from '@/components/ui/bits';
import { toast } from '@/components/ui/Toast';

const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const AVATAR_MAX = 5 * 1024 * 1024;

export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  if (!user) return null;
  const dirty = name.trim() !== user.name;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = nameError(name);
    setError(err);
    if (err || !dirty) return;
    setSaving(true);
    try {
      const res = await api.updateProfile(name.trim());
      updateUser(res.user, res.token);
      setName(res.user.name);
      toast.success('名字已更新');
    } catch (e2) {
      setError(explain(e2).message);
    } finally {
      setSaving(false);
    }
  };

  // 头像直传到存储：先要签名地址，传完再确认
  const upload = async (file: File) => {
    if (!AVATAR_TYPES.includes(file.type)) {
      toast.error('只支持 JPG、PNG、WebP、GIF 图片');
      return;
    }
    if (file.size > AVATAR_MAX) {
      toast.error('图片不能超过 5 MB');
      return;
    }
    setUploading(true);
    try {
      const ticket = await api.avatarUploadUrl(file.type, file.size);
      const put = await fetch(ticket.upload_url, { method: 'PUT', headers: ticket.headers, body: file });
      if (!put.ok) {
        toast.error('上传失败，请重试');
        return;
      }
      const res = await api.confirmAvatar(ticket.key);
      updateUser(res.user);
      toast.success('头像已更新');
    } catch (e2) {
      toast.error(explain(e2).message);
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    setRemoving(true);
    try {
      const res = await api.removeAvatar();
      updateUser(res.user);
      toast.success('头像已移除');
    } catch (e2) {
      toast.error(explain(e2).message);
    } finally {
      setRemoving(false);
    }
  };

  const rows: [string, React.ReactNode][] = [
    ['邮箱', <span key="e" className="font-mono text-[13px]">{user.email}</span>],
    ['账号类型', isZju(user.email) ? <Badge key="t">浙大邮箱</Badge> : <Badge key="t" tone="brass">校友</Badge>],
    ['身份', user.is_admin ? <Badge key="r" tone="accent">管理员</Badge> : <Badge key="r">成员</Badge>],
    ['编号', <span key="n" className="font-mono text-[13px] tabular">No.{memberNumber(user.id)}</span>],
    ['加入时间', formatDate(user.created_at)],
    ['上次登录', relativeTime(user.last_login)],
  ];

  return (
    <div>
      <PageHeader title="个人资料" description="名字会显示在你用此账号登录的服务中。" />

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <section className="card flex h-fit flex-col items-center p-7 text-center animate-rise">
          <div className="relative">
            <div aria-hidden className="absolute -inset-3 rounded-full border border-line-soft" />
            <div aria-hidden className="absolute -inset-6 rounded-full border border-line-soft/60" />
            <Avatar name={user.name} src={user.avatar_url} size={96} />
          </div>
          <p className="mt-8 font-serif-sc text-[22px] font-semibold text-fg">{user.name}</p>
          <p className="mt-1 text-[13px] text-fg-faint">{user.email}</p>
          <div className="mt-6 w-full space-y-2 border-t border-line-soft pt-5">
            <input
              ref={picker}
              type="file"
              accept={AVATAR_TYPES.join(',')}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void upload(file);
              }}
            />
            <Button variant="secondary" size="sm" className="w-full" loading={uploading} disabled={removing} onClick={() => picker.current?.click()} icon={<Camera className="size-3.5" />}>
              {user.avatar_url ? '更换头像' : '上传头像'}
            </Button>
            {user.avatar_url && (
              <Button variant="ghost" size="sm" className="w-full" loading={removing} disabled={uploading} onClick={remove}>
                移除头像
              </Button>
            )}
            <p className="pt-1 text-[12px] text-fg-ghost">JPG、PNG、WebP 或 GIF，不超过 5 MB</p>
          </div>
        </section>

        <div className="space-y-6 animate-rise [animation-delay:100ms]">
          <section className="card p-6">
            <form onSubmit={save} className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <TextField
                label="名字"
                value={name}
                maxLength={50}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                error={error}
                hint="2–50 个字"
                wrapperClassName="flex-1"
              />
              <Button type="submit" variant="primary" className="sm:mt-[29px]" disabled={!dirty} loading={saving} icon={<Check className="size-4" />}>
                保存
              </Button>
            </form>
          </section>

          <section className="card p-6">
            <SectionTitle>账号信息</SectionTitle>
            <dl className="divide-y divide-line-soft">
              {rows.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-4 py-3">
                  <dt className="text-[13px] text-fg-faint">{k}</dt>
                  <dd className="text-right text-[14px] text-fg-soft">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-[12.5px] text-fg-ghost">如需更改邮箱，请联系管理员。</p>
          </section>
        </div>
      </div>
    </div>
  );
}
