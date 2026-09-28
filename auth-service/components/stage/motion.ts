/** 状态优先级独立于表单；错误、提交中均覆盖预览开锁。 */
export type StageStatus = 'idle' | 'working' | 'error' | 'success';

export function resolvePose(status: StageStatus, progress: number, open: boolean, hovered: boolean) {
  const count = Math.max(0, Math.min(5, Math.floor(progress)));
  if (status === 'error') return { count: 0, unlocked: false };
  if (status === 'working') return { count, unlocked: false };
  const unlocked = status === 'success' || open || hovered;
  return { count: unlocked ? 5 : count, unlocked };
}

export interface Spring { x: number; v: number }

export function stepSpring(s: Spring, target: number, dt: number, k = 170, c = 16) {
  // 子步进保持 30/60/120 Hz 下近似相同的弹簧响应，后台恢复最多推进 50 ms。
  const duration = Math.min(dt, 0.05);
  const steps = Math.max(1, Math.ceil(duration * 120));
  const h = duration / steps;
  for (let i = 0; i < steps; i++) {
    s.v += (k * (target - s.x) - c * s.v) * h;
    s.x += s.v * h;
  }
}
