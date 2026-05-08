import { twMerge } from "tailwind-merge";

type Variant = "default" | "success" | "warning" | "error" | "info" | "muted";

const VARIANTS: Record<Variant, string> = {
  default: "bg-slate-100 text-slate-700",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  error:   "bg-red-50 text-red-700",
  info:    "bg-indigo-50 text-indigo-700",
  muted:   "bg-slate-50 text-slate-500",
};

const STATUS_VARIANT_MAP: Record<string, Variant> = {
  Applied:   "info",
  Viewed:    "warning",
  Interview: "success",
  Offer:     "success",
  Rejected:  "error",
  Running:   "success",
  Idle:      "muted",
  Active:    "success",
  Pending:   "warning",
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: Variant;
  status?: string;
  className?: string;
}

export function Badge({ children, variant, status, className }: BadgeProps) {
  const resolvedVariant: Variant =
    variant ?? (status ? STATUS_VARIANT_MAP[status] ?? "default" : "default");

  return (
    <span
      className={twMerge(
        "inline-flex items-center px-2 py-0.5 rounded-md text-[11.5px] font-semibold",
        VARIANTS[resolvedVariant],
        className
      )}
    >
      {children}
    </span>
  );
}

export function StatusDot({ status }: { status: "running" | "idle" | "error" }) {
  const colors = {
    running: "bg-emerald-500 animate-pulse",
    idle:    "bg-slate-300",
    error:   "bg-red-500",
  };
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${colors[status]}`} />;
}
