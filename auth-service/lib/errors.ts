import { ApiError } from '@/lib/api';

/** 把后端错误翻成人话。field 用来把提示放到对应输入框下面。 */
export function explain(err: unknown): { message: string; field?: string } {
  if (!(err instanceof ApiError)) return { message: '出现问题，请重试' };
  switch (err.code) {
    case 'NETWORK_ERROR':
      return { message: '无法连接网络' };
    case 'AUTH_001':
      if (err.field === 'current_password') return { message: '当前密码错误', field: 'current_password' };
      return { message: '邮箱或密码错误', field: err.field ?? 'password' };
    case 'AUTH_002':
      return { message: '请使用浙大邮箱；校友邮箱需先加入白名单', field: 'email' };
    case 'AUTH_003':
      return { message: err.message, field: 'code' };
    case 'AUTH_005':
      return { message: '此邮箱已注册', field: 'email' };
    case 'AUTH_006':
      return { message: '此账号已停用，请联系管理员' };
    case 'AUTH_007':
      return { message: '此邮箱已被封禁，请联系管理员' };
    case 'RATE_001': {
      const wait = err.retryAfter;
      const when = wait ? (wait >= 90 ? `${Math.ceil(wait / 60)} 分钟后` : `${wait} 秒后`) : '稍后';
      return { message: `${err.message.replace(/[，,]?\s*(请)?稍后再试$/, '')}，${when}再试` };
    }
    default:
      return { message: err.message || '出现问题，请重试', field: err.field };
  }
}
