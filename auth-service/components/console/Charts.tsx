'use client';

import { useId, useLayoutEffect, useRef, useState } from 'react';
import { Table2 } from 'lucide-react';
import { cn } from '@/lib/cn';

/*
 * 管理概览的几张小图。全部单序列，只用一个颜色（--chart，已过 dataviz 校验）。
 * 规矩：细线条、柱宽 ≤ 24、顶端 4px 圆角、网格是实线细线、只标极值和末值、
 * 悬停有提示，每张图都能切到表格看原始数字。
 */

export interface Datum {
  /** 轴上的短标签 */
  label: string;
  /** 提示框里的完整标签 */
  full: string;
  value: number;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** 0 起步、整数、3~4 格的刻度 */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag);
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

const fmt = (n: number) => n.toLocaleString('zh-CN');

// ---------------------------------------------------------------- 外壳：标题 + 表格视图

export function ChartCard({
  title,
  subtitle,
  table,
  className,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  table?: { headers: [string, string]; rows: [string, number][] };
  className?: string;
  children: React.ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className={cn('card flex flex-col p-5 sm:p-6', className)}>
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-medium text-fg">{title}</h3>
          {subtitle && <p className="mt-1 text-[12.5px] text-fg-faint">{subtitle}</p>}
        </div>
        {table && (
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            aria-pressed={showTable}
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-lg px-2 text-[12px] transition-colors',
              showTable ? 'bg-surface-3 text-fg' : 'text-fg-ghost hover:bg-surface-2 hover:text-fg-soft',
            )}
          >
            <Table2 className="size-3.5" />
            表格
          </button>
        )}
      </header>
      {showTable && table ? (
        <div className="max-h-[260px] overflow-auto rounded-[10px] border border-line-soft">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-surface-2 text-left text-fg-faint">
              <tr>
                <th className="px-3 py-2 font-normal">{table.headers[0]}</th>
                <th className="px-3 py-2 text-right font-normal">{table.headers[1]}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {table.rows.map(([k, v]) => (
                <tr key={k}>
                  <td className="px-3 py-1.5 text-fg-soft">{k}</td>
                  <td className="px-3 py-1.5 text-right text-fg tabular">{fmt(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

// ---------------------------------------------------------------- 提示框

function Tip({ x, y, value, label, unit, width }: { x: number; y: number; value: number; label: string; unit: string; width: number }) {
  const left = Math.min(Math.max(x, 64), Math.max(64, width - 64));
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-[10px] border border-line bg-surface-3/95 px-3 py-2 shadow-[var(--shadow-md)] backdrop-blur-sm"
      style={{ left, top: y - 10 }}
    >
      <div className="flex items-center gap-2">
        <span aria-hidden className="h-0.5 w-3 rounded-full bg-chart" />
        <span className="text-[15px] font-semibold text-fg tabular">{fmt(value)}</span>
        <span className="text-[12px] text-fg-soft">{unit}</span>
      </div>
      <p className="mt-0.5 text-[11.5px] whitespace-nowrap text-fg-faint">{label}</p>
    </div>
  );
}

const PAD = { top: 22, right: 12, bottom: 26, left: 30 };

function Grid({ ticks, y, width }: { ticks: number[]; y: (v: number) => number; width: number }) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--line-soft)" strokeWidth={1} shapeRendering="crispEdges" />
          <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-fg-ghost text-[10.5px] tabular">
            {fmt(t)}
          </text>
        </g>
      ))}
    </g>
  );
}

// ---------------------------------------------------------------- 柱状图（每月注册）

function columnPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function ColumnChart({ data, unit, height = 200 }: { data: Datum[]; unit: string; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.value), 0);
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const band = plotW / Math.max(1, data.length);
  const barW = Math.min(24, band * 0.56);
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const maxIdx = data.findIndex((d) => d.value === max && max > 0);
  const labelEvery = band < 30 ? 2 : 1;

  return (
    <div ref={ref} className="relative" style={{ height }} onPointerLeave={() => setActive(null)}>
      {width > 0 && (
        <svg width={width} height={height} className="block overflow-visible" role="img" aria-label={`柱状图，${unit}`}>
          <Grid ticks={ticks} y={y} width={width} />
          {data.map((d, i) => {
            const cx = PAD.left + band * i + band / 2;
            const h = y(0) - y(d.value);
            const labelled = i === maxIdx || i === data.length - 1;
            return (
              <g key={d.full}>
                {h > 0 && (
                  <path
                    d={columnPath(cx - barW / 2, y(d.value), barW, h)}
                    fill="var(--chart)"
                    opacity={active === null || active === i ? 1 : 0.45}
                    className="transition-opacity duration-200"
                  />
                )}
                {labelled && d.value > 0 && active === null && (
                  <text x={cx} y={y(d.value) - 7} textAnchor="middle" className="fill-fg-soft text-[11px] tabular">
                    {fmt(d.value)}
                  </text>
                )}
                {i % labelEvery === (data.length - 1) % labelEvery && (
                  <text x={cx} y={height - 8} textAnchor="middle" className="fill-fg-ghost text-[10.5px]">
                    {d.label}
                  </text>
                )}
                {/* 命中区：整条 band，比柱子大得多 */}
                <rect
                  x={cx - band / 2}
                  y={PAD.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${d.full}：${d.value} ${unit}`}
                  className="outline-none"
                  onPointerEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                />
              </g>
            );
          })}
        </svg>
      )}
      {active !== null && data[active] && (
        <Tip
          x={PAD.left + band * active + band / 2}
          y={Math.min(y(data[active].value), y(0) - 8)}
          value={data[active].value}
          label={data[active].full}
          unit={unit}
          width={width}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 面积折线（每日活跃）

export function AreaChart({ data, unit, height = 200 }: { data: Datum[]; unit: string; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const gradId = useId();
  const max = Math.max(...data.map((d) => d.value), 0);
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const plotW = Math.max(0, width - PAD.left - PAD.right - 26);
  const plotH = height - PAD.top - PAD.bottom;
  const step = plotW / Math.max(1, data.length - 1);
  const x = (i: number) => PAD.left + 6 + i * step;
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join('');
  const area = `${line}L${x(data.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const last = data.length - 1;
  const maxIdx = data.findIndex((d) => d.value === max && max > 0);
  const tickIdx = [0, Math.round(last / 2), last];

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.round((e.clientX - box.left - 6) / step);
    setActive(Math.max(0, Math.min(last, i)));
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') setActive((a) => Math.max(0, (a ?? last) - 1));
    if (e.key === 'ArrowRight') setActive((a) => Math.min(last, (a ?? 0) + 1));
  };

  return (
    <div ref={ref} className="relative" style={{ height }}>
      {width > 0 && data.length > 1 && (
        <svg width={width} height={height} className="block overflow-visible" role="img" aria-label={`折线图，${unit}`}>
          <defs>
            <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--chart)" stopOpacity={0.16} />
              <stop offset="100%" stopColor="var(--chart)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <Grid ticks={ticks} y={y} width={width} />
          <path d={area} fill={`url(#${gradId})`} />
          <path d={line} fill="none" stroke="var(--chart)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {tickIdx.map((i) => (
            <text key={i} x={x(i)} y={height - 8} textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'} className="fill-fg-ghost text-[10.5px]">
              {data[i].label}
            </text>
          ))}
          {/* 峰值和末值直接标注 */}
          {active === null &&
            [...new Set([maxIdx, last])].filter((i) => i >= 0).map((i) =>
              i === last ? (
                // 末值放在端点右边，不和线打架
                <text key={i} x={x(i) + 9} y={y(data[i].value)} dy="0.32em" className="fill-fg-soft text-[11px] tabular">
                  {fmt(data[i].value)}
                </text>
              ) : (
                <text key={i} x={x(i)} y={y(data[i].value) - 10} textAnchor="middle" className="fill-fg-soft text-[11px] tabular">
                  {fmt(data[i].value)}
                </text>
              ),
            )}
          {active !== null && (
            <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={y(0)} stroke="var(--line-strong)" strokeWidth={1} shapeRendering="crispEdges" />
          )}
          <circle
            cx={x(active ?? last)}
            cy={y(data[active ?? last].value)}
            r={4}
            fill="var(--chart)"
            stroke="var(--surface)"
            strokeWidth={2}
            paintOrder="stroke"
          />
          <rect
            x={PAD.left}
            y={PAD.top - 10}
            width={width - PAD.left - PAD.right}
            height={plotH + 10}
            fill="transparent"
            tabIndex={0}
            aria-label="用左右方向键查看每天的数字"
            className="outline-none"
            onPointerMove={onMove}
            onPointerLeave={() => setActive(null)}
            onFocus={() => setActive(last)}
            onBlur={() => setActive(null)}
            onKeyDown={onKey}
          />
        </svg>
      )}
      {active !== null && data[active] && (
        <Tip x={x(active)} y={y(data[active].value)} value={data[active].value} label={data[active].full} unit={unit} width={width} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 横条（服务使用）

export function BarList({ items, unit }: { items: { key: string; label: string; hint?: string; value: number }[]; unit: string }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  if (items.length === 0) return <p className="py-10 text-center text-[13px] text-fg-faint">暂无数据</p>;
  return (
    <ul className="space-y-4">
      {items.map((item) => (
        <li key={item.key}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className="text-[13.5px] text-fg-soft">
              {item.label}
              {item.hint && <span className="ml-2 text-[12px] text-fg-ghost">{item.hint}</span>}
            </span>
          </div>
          <div className="flex items-center gap-3" title={`${item.label}：${item.value} ${unit}`}>
            <div className="h-2.5 flex-1">
              <div
                className="h-full min-w-[2px] rounded-r-[4px] bg-chart transition-[width] duration-700 ease-[var(--ease-out)]"
                style={{ width: `${(item.value / max) * 100}%`, opacity: item.value ? 1 : 0.35 }}
              />
            </div>
            <span className="w-14 shrink-0 text-right text-[13px] text-fg tabular">
              {fmt(item.value)}
              <span className="ml-0.5 text-[11px] text-fg-ghost">{unit}</span>
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- 比例条（白名单注册率等）

export function Meter({ value, total, label }: { value: number; total: number; label: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between text-[13px]">
        <span className="text-fg-soft">{label}</span>
        <span className="text-fg tabular">
          {value}
          <span className="text-fg-ghost"> / {total}</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-chart-wash" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={total} aria-label={label}>
        <div className="h-full rounded-full bg-chart transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
