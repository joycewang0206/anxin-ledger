import { formatYuan } from "@/lib/money";

const PALETTE = ["#b45309", "#1e40af", "#166534", "#7c3aed", "#0e7490", "#be185d"];
const OTHER = "#6b7280";

export type DonutItem = { category: string; total: number; percent: number };

/** 圓餅圖（甜甜圈）：中間顯示總支出，旁邊一定有文字清單，不靠顏色辨識。 */
export function CategoryDonut({ items, total }: { items: DonutItem[]; total: number }) {
  const top = items.slice(0, 6);
  const rest = items.slice(6);
  const slices = [
    ...top.map((c, i) => ({ label: c.category, value: c.total, percent: c.percent, color: PALETTE[i] })),
    ...(rest.length
      ? [{ label: "其他", value: rest.reduce((a, c) => a + c.total, 0), percent: rest.reduce((a, c) => a + c.percent, 0), color: OTHER }]
      : []),
  ];
  const R = 70;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <svg viewBox="0 0 200 200" className="h-52 w-52 shrink-0" role="img" aria-label={`本月支出共 ${formatYuan(total)}，分成 ${slices.length} 類`}>
        <g transform="rotate(-90 100 100)">
          {slices.map((s) => {
            const len = (s.value / total) * C;
            const el = (
              <circle key={s.label} cx="100" cy="100" r={R} fill="none" stroke={s.color} strokeWidth="34" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} />
            );
            offset += len;
            return el;
          })}
        </g>
        <text x="100" y="94" textAnchor="middle" fontSize="14" fill="#4b5563">本月支出</text>
        <text x="100" y="118" textAnchor="middle" fontSize="19" fontWeight="800" fill="#1f2933">{formatYuan(total)}</text>
      </svg>
      <ul className="flex w-full flex-col gap-2">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2 font-bold">
            <span aria-hidden className="inline-block h-5 w-5 shrink-0 rounded" style={{ background: s.color }} />
            <span className="flex-1">{s.label}</span>
            <span>{s.percent}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
