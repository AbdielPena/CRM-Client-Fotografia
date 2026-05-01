import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils/cn"

const buttonVariants = cva(
  [
    "relative inline-flex items-center justify-center gap-2",
    "whitespace-nowrap rounded-md font-medium",
    "transition-all duration-base ease-standard",
    "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20",
    "disabled:pointer-events-none disabled:opacity-50",
    "active:scale-[0.98]",
    "select-none",
  ],
  {
    variants: {
      variant: {
        // Primary: Aurora gradient + glow (THE hero CTA)
        default: [
          "text-white border border-transparent",
          "bg-[linear-gradient(135deg,hsl(240_84%_64%)_0%,hsl(262_83%_58%)_50%,hsl(292_84%_60%)_100%)]",
          "bg-[length:200%_200%] [background-position:0%_50%]",
          "shadow-glow hover:shadow-glow-lg hover:[background-position:100%_50%]",
          "hover:-translate-y-px",
        ],
        // Solid violet flat (no gradient) — for less-important primary actions
        solid:
          "bg-brand text-brand-foreground hover:bg-brand/90 shadow-sm hover:shadow-md hover:-translate-y-px",
        // Secondary: muted surface
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-muted border border-transparent",
        // Outline: subtle border, ghost-like
        outline:
          "border border-border-strong bg-transparent text-foreground hover:bg-muted hover:border-brand/40",
        // Ghost: no bg, hover lifts to muted
        ghost:
          "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
        // Destructive (danger)
        destructive:
          "bg-danger text-danger-foreground hover:bg-danger/90 shadow-sm hover:shadow-glow-danger hover:-translate-y-px border border-transparent",
        // Success
        success:
          "bg-success text-success-foreground hover:bg-success/90 shadow-sm hover:shadow-glow-success hover:-translate-y-px border border-transparent",
        // Link: plain text with underline
        link: "text-brand underline-offset-4 hover:underline bg-transparent",
        // Soft: brand-tinted background
        soft:
          "bg-brand-soft text-brand-soft-foreground hover:bg-brand/15 border border-transparent",
      },
      size: {
        xs: "h-7 px-2.5 text-caption rounded",
        sm: "h-9 px-3 text-body-sm rounded-md",
        default: "h-10 px-4 text-body",
        lg: "h-11 px-6 text-body",
        xl: "h-12 px-7 text-body font-semibold",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8",
        "icon-lg": "h-11 w-11",
      },
      fullWidth: {
        true: "w-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      fullWidth,
      asChild = false,
      loading = false,
      leftIcon,
      rightIcon,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading

    // asChild: Slot merges props into the single child element.
    // Slot uses React.Children.only, so we must pass exactly one child.
    // We clone the child and inject leftIcon/rightIcon into its children.
    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<{ children?: React.ReactNode }>
      return (
        <Slot
          className={cn(buttonVariants({ variant, size, fullWidth }), className)}
          ref={ref as React.Ref<HTMLElement>}
          {...(props as Record<string, unknown>)}
        >
          {React.cloneElement(child, {
            children: (
              <>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  leftIcon && (
                    <span className="inline-flex shrink-0">{leftIcon}</span>
                  )
                )}
                {child.props.children}
                {!loading && rightIcon && (
                  <span className="inline-flex shrink-0">{rightIcon}</span>
                )}
              </>
            ),
          })}
        </Slot>
      )
    }

    return (
      <button
        className={cn(buttonVariants({ variant, size, fullWidth }), className)}
        ref={ref}
        disabled={isDisabled}
        {...props}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>
        )}
        {children}
        {!loading && rightIcon && (
          <span className="inline-flex shrink-0">{rightIcon}</span>
        )}
      </button>
    )
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }
