import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

/**
 * The Airbnb-style card: white surface, 12px radius, soft diffuse shadow
 * instead of a hard border, subtle hover lift. Used as the base container
 * for every grouped unit across bord's screens (Law of Proximity: cards are
 * how bord groups related information rather than relying on rules/borders).
 */
export function Card({
  className,
  interactive,
  ...props
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-card bg-surface shadow-card p-5",
        interactive && "transition-shadow duration-150 hover:shadow-card-hover cursor-pointer",
        className,
      )}
      {...props}
    />
  );
}
