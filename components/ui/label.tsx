"use client"

import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils/cn"

const labelVariants = cva(
  [
    "inline-flex items-center gap-1.5 text-body-sm font-medium leading-tight text-foreground",
    "peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
    "transition-colors duration-fast",
  ],
  {
    variants: {
      tone: {
        default: "",
        muted: "text-muted-foreground font-normal",
        error: "text-danger",
        success: "text-success",
      },
      size: {
        sm: "text-caption",
        default: "text-body-sm",
        lg: "text-body",
      },
    },
    defaultVariants: {
      tone: "default",
      size: "default",
    },
  },
)

interface LabelProps
  extends React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>,
    VariantProps<typeof labelVariants> {
  required?: boolean
}

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  LabelProps
>(({ className, tone, size, required, children, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants({ tone, size }), className)}
    {...props}
  >
    {children}
    {required && (
      <span className="text-danger leading-none" aria-hidden="true">
        *
      </span>
    )}
  </LabelPrimitive.Root>
))
Label.displayName = LabelPrimitive.Root.displayName

export { Label, labelVariants }
