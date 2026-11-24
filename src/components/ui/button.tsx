import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-control text-sm font-semibold whitespace-nowrap transition-all duration-150 active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "btn-primary",
        destructive:
          "bg-danger-soft text-danger hover:bg-danger-soft/70",
        outline:
          "border bg-background hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5 py-2 has-[>svg]:px-4 max-sm:h-10 max-sm:gap-1.5 max-sm:px-3.5 max-sm:text-[0.8125rem] max-sm:has-[>svg]:px-3",
        xs: "h-6 max-sm:h-9 gap-1 px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 max-sm:h-10 gap-1.5 px-3.5 has-[>svg]:px-3 max-sm:px-3 max-sm:text-[0.8125rem] max-sm:has-[>svg]:px-2.5",
        lg: "h-12 px-6 text-base has-[>svg]:px-5 max-sm:h-11 max-sm:px-5 max-sm:text-[0.9375rem]",
        icon: "size-11 max-sm:size-10",
        "icon-xs": "size-6 max-sm:size-9 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9 max-sm:size-10",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
