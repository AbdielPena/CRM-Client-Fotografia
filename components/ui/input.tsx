import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils/cn"

const inputVariants = cva(
  [
    "flex w-full rounded-md text-body",
    "transition-all duration-fast ease-standard",
    "file:border-0 file:bg-transparent file:text-body-sm file:font-medium file:text-foreground",
    "placeholder:text-muted-foreground placeholder:font-normal",
    "focus-visible:outline-none",
    "disabled:cursor-not-allowed disabled:opacity-50",
  ],
  {
    variants: {
      variant: {
        // Default: muted filled (no visible border at rest)
        default: [
          "h-10 px-3.5 py-2",
          "bg-muted/60 border border-transparent text-foreground",
          "hover:bg-muted",
          "focus-visible:bg-background focus-visible:border-brand",
          "focus-visible:shadow-[0_0_0_4px_hsl(var(--brand)/0.15)]",
        ],
        // Outline: visible border always
        outline: [
          "h-10 px-3.5 py-2",
          "bg-background border border-border-strong text-foreground",
          "hover:border-brand/40",
          "focus-visible:border-brand",
          "focus-visible:shadow-[0_0_0_4px_hsl(var(--brand)/0.15)]",
        ],
        // Ghost: minimal, for inline edits
        ghost: [
          "h-9 px-2 py-1",
          "bg-transparent border border-transparent text-foreground",
          "hover:bg-muted focus-visible:bg-muted",
        ],
        // Error state
        error: [
          "h-10 px-3.5 py-2",
          "bg-danger-soft border border-danger/40 text-foreground",
          "focus-visible:border-danger",
          "focus-visible:shadow-[0_0_0_4px_hsl(var(--danger)/0.15)]",
        ],
        // Success state
        success: [
          "h-10 px-3.5 py-2",
          "bg-success-soft border border-success/40 text-foreground",
          "focus-visible:border-success",
          "focus-visible:shadow-[0_0_0_4px_hsl(var(--success)/0.15)]",
        ],
      },
      inputSize: {
        sm: "h-9 text-body-sm px-3",
        default: "",
        lg: "h-11 text-body px-4",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
    VariantProps<typeof inputVariants> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, variant, inputSize, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(inputVariants({ variant, inputSize }), className)}
        ref={ref}
        {...props}
      />
    )
  },
)
Input.displayName = "Input"

export { Input, inputVariants }
