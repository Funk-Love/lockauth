import { cn } from '@/lib/cn';

/** 两道细竖线轮流亮起——家族母题做的加载指示 */
export function Spinner({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center justify-center gap-[3px]', className)} role="status" aria-label="加载中">
      <span className="h-[70%] w-[2px] rounded-full bg-current [animation:breathe_0.9s_ease-in-out_infinite]" />
      <span className="h-[70%] w-[2px] rounded-full bg-current [animation:breathe_0.9s_ease-in-out_0.45s_infinite]" />
    </span>
  );
}

export function PageSpinner({ label = '加载中' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-fg-faint">
      <Spinner className="h-5" />
      <span className="text-xs tracking-[0.2em]">{label}</span>
    </div>
  );
}
