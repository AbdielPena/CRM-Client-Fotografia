import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils/cn"

const buttonVariants = cva(
  [
    "relative inline-flex items-center justify-center gap-2",
    "whitespace-nowrap rounded-lg text-sm font-medium",
    "transition-colors duration-fast ease-standard",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50",
    "select-none",
  ],
  {
    variants: {
      variant: {
        // Primary: azul sólido limpio (Lumen)
        default:
          "bg-brand text-brand-foreground border border-brand/0 hover:bg-brand/90 active:bg-brand/95",
        // Alias para los que pedían azul sólido sin alterar (mismo que default ahora)
        solid:
          "bg-brand text-brand-foreground hover:bg-brand/90 active:bg-brand/95",
        // Secondary: white con border
        secondary:
          "bg-card text-foreground border border-border hover:bg-muted hover:border-border-strong",
        // Outline: igual que secondary pero sobre background, no card
        outline:
          "bg-background text-foreground border border-border hover:bg-muted hover:border-border-strong",
        // Ghost: sin bg, hover muted
        ghost:
          "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
        // Destructive
        destructive:
          "bg-danger text-danger-foreground hover:bg-danger/90 active:bg-danger/95",
        // Success
        success:
          "bg-success text-success-foreground hover:bg-success/90 active:bg-success/95",
        // Link
        link: "text-brand underline-offset-4 hover:underline bg-transparent",
        // Soft: tinte brand muy ligero
        soft:
          "bg-brand-soft text-brand-soft-foreground hover:bg-brand/10",
      },
      size: {
        xs: "h-7 px-2.5 text-xs rounded-md",
        sm: "h-8 px-3 text-xs rounded-md",
        default: "h-9 px-3.5",
        lg: "h-10 px-5",
        xl: "h-11 px-6 font-semibold",
        icon: "h-9 w-9",
        "icon-sm": "h-8 w-8",
        "icon-lg": "h-10 w-10",
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
