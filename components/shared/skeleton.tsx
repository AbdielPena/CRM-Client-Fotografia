import { cn } from "@/lib/utils/cn"

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * Skeleton loader con shimmer animado — usa el helper CSS `.sf-skeleton`
 * definido en globals.css. Dark-mode aware vía tokens.
 */
export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn("sf-skeleton rounded-md", className)}
      {...props}
    />
  )
}

/** Fila skeleton para tablas. */
export function SkeletonRow({ cols = 4 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-4">
          <Skeleton className="h-3 w-full" />
        </td>
      ))}
    </tr>
  )
}

/** Card skeleton — para lists de items. */
export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <Skeleton className="mb-3 h-3 w-1/3" />
      <Skeleton className="mb-2 h-6 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  )
}
