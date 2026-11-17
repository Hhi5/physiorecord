import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 text-xs font-bold transition-colors focus:outline-none tabular-nums",
  {
    variants: {
      variant: {
        default:
          "text-primary-700 dark:text-primary-300",
        secondary:
          "text-muted-foreground-1 font-semibold",
        destructive:
          "text-rose-700 dark:text-rose-400",
        warning:
          "text-amber-700 dark:text-amber-300",
        success:
          "text-emerald-700 dark:text-emerald-300",
        outline:
          "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
