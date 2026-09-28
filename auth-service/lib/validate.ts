/** 前端校验：规则与后端一致，只是提前告诉用户。 */

const EMAIL = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export const ZJU = '@zju.edu.cn';

export const normalizeEmail = (v: string) => v.trim().toLowerCase();
export const isEmail = (v: string) => EMAIL.test(normalizeEmail(v));
export const isZju = (v: string) => normalizeEmail(v).endsWith(ZJU);

export function emailError(v: string): string | null {
  if (!v.trim()) return '请输入邮箱';
  if (!isEmail(v)) return '邮箱格式不正确';
  return null;
}

export function passwordError(v: string): string | null {
  if (!v) return '请输入密码';
  if (v.length < 6) return '密码至少 6 位';
  if (v.length > 128) return '密码最多 128 位';
  return null;
}

export function nameError(v: string): string | null {
  const n = v.trim();
  if (!n) return '请输入名字';
  if (n.length < 2) return '名字至少 2 个字';
  if (n.length > 50) return '名字最多 50 个字';
  return null;
}

export const isCode = (v: string) => /^\d{6}$/.test(v);

/** 粗略的密码强度：0–3，只作提示不作限制 */
export function passwordStrength(v: string): number {
  if (v.length < 6) return 0;
  let score = 1;
  if (v.length >= 10) score++;
  if (/[a-z]/.test(v) && /[A-Z0-9]/.test(v) && /[^a-zA-Z0-9]/.test(v)) score++;
  else if (/[a-zA-Z]/.test(v) && /\d/.test(v)) score = Math.max(score, 2);
  return Math.min(score, 3);
}
