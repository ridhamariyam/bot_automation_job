type Props = {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "blue" | "green" | "amber" | "purple" | "gray";
};

const ACCENT = {
  blue:   "text-blue-600 bg-blue-50",
  green:  "text-emerald-600 bg-emerald-50",
  amber:  "text-amber-600 bg-amber-50",
  purple: "text-purple-600 bg-purple-50",
  gray:   "text-gray-700 bg-gray-100",
};

export function StatCard({ label, value, sub, accent = "blue" }: Props) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-1">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold tabular-nums ${ACCENT[accent].split(" ")[0]}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}
