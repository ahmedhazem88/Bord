import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

/**
 * Pill-shaped primary control, per the Airbnb-style system: a confident,
 * high-contrast CTA with a generous tap target. `lg` is sized for the
 * meeting-room vote panel specifically (DESIGN-PRINCIPLES.md, Fitt's Law:
 * the primary path at the moment of a vote needs the largest, closest
 * target on screen).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", fullWidth, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-full font-bold transition-all duration-150 focus-ring disabled:cursor-not-allowed disabled:opacity-50",
          variant === "primary" &&
            "bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 shadow-sm",
          variant === "secondary" &&
            "bg-ink-100 text-ink-900 hover:bg-ink-200 active:bg-ink-300",
          variant === "ghost" &&
            "bg-transparent text-ink-700 hover:bg-ink-50 active:bg-ink-100",
          variant === "danger" &&
            "bg-violation-500 text-white hover:bg-violation-600",
          size === "sm" && "h-9 px-4 text-sm",
          size === "md" && "h-11 px-6 text-[15px]",
          size === "lg" && "h-16 px-10 text-lg",
          fullWidth && "w-full",
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
