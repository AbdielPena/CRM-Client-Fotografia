import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils/cn"

const badgeVariants = cva(
  [
    "inline-flex items-center gap-1 rounded-full border font-medium",
    "transition-all duration-fast ease-standard",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
  ],
  {
    variants: {
      variant: {
        // Default: brand soft — used for tags/categories
        default:
          "border-brand/15 bg-brand-soft text-brand-soft-foreground hover:bg-brand/15",
        // Solid brand
        brand: "border-transparent bg-brand text-brand-foreground hover:bg-brand/90",
        // Secondary: muted
        secondary:
          "border-transparent bg-muted text-foreground/80 hover:bg-muted/70",
        // Success
        success:
          "border-success/20 bg-success-soft text-success dark:text-success dark:bg-success/10",
        // Warning
        warning:
          "border-warning/20 bg-warning-soft text-warning-foreground dark:text-warning dark:bg-warning/10",
        // Danger / destructive
        destructive:
          "border-danger/20 bg-danger-soft text-danger dark:text-danger dark:bg-danger/10",
        // Info
        info: "border-info/20 bg-info-soft text-info dark:text-info dark:bg-info/10",
        // Outline only
        outline: "border-border-strong bg-transparent text-foreground",
        // Ghost — no border
        ghost:
          "border-transparent bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted",
      },
      size: {
        sm: "px-2 py-0.5 text-[10px] leading-4",
        default: "px-2.5 py-0.5 text-caption",
        lg: "px-3 py-1 text-body-sm",
      },
      dot: {
        true: "pl-1.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  withDot?: boolean
}

function Badge({ className, variant, size, withDot, children, ...props }: BadgeProps) {
  return (
    <div
      className={cn(badgeVariants({ variant, size, dot: withDot }), className)}
      {...props}
    >
      {withDot && (
        <span
          aria-hidden="true"
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            variant === "success" && "bg-success",
            variant === "warning" && "bg-warning",
            variant === "destructive" && "bg-danger",
            variant === "info" && "bg-info",
            variant === "brand" && "bg-card/80",
            (!variant || variant === "default" || variant === "secondary") &&
              "bg-brand",
          )}
        />
      )}
      {children}
    </div>
  )
}

export { Badge, badgeVariants }
