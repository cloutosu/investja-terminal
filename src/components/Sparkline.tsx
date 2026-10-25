import { useId } from 'react';

// Axis-free trend line. Flat data draws a muted straight line instead of looking broken.
export function Sparkline({ values, color, height = 22 }: { values: number[]; color: string; height?: number }) {
  const id = useId();
  const w = 100;
  const pts = values.length >= 2 ? values : [values[0] ?? 0, values[0] ?? 0];
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const flat = max - min < 1e-9;
  const y = (v: number) => (flat ? height / 2 : 2 + (1 - (v - min) / (max - min)) * (height - 4));
  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / (pts.length - 1)) * w).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="block w-full" style={{ height }} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.14} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {!flat && <path d={`${d} L${w},${height} L0,${height} Z`} fill={`url(#${id})`} />}
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeOpacity={flat ? 0.35 : 0.8} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
