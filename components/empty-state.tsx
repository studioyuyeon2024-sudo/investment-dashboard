import Link from "next/link";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: { label: string; href: string; variant?: "default" | "outline" };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-dashed bg-muted/20 px-6 py-10 text-center",
        className,
      )}
    >
      {icon && <div className="text-2xl text-muted-foreground">{icon}</div>}
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {description && (
          <p className="max-w-sm text-xs text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action && (
        <Link
          href={action.href}
          className={buttonVariants({
            variant: action.variant ?? "default",
            size: "sm",
          })}
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
