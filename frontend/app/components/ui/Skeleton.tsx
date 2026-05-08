import { twMerge } from "tailwind-merge";

export function Skeleton({ className }: { className?: string }) {
  return <div className={twMerge("skeleton", className)} />;
}

export function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-slate-100 p-5 space-y-3">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 py-3">
      <Skeleton className="h-4 w-1/4" />
      <Skeleton className="h-4 w-1/5" />
      <Skeleton className="h-5 w-16 rounded-md" />
      <Skeleton className="h-4 w-16 ml-auto" />
    </div>
  );
}
