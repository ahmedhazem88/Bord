import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, hint, id, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={id} className="text-sm font-semibold text-ink-900">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            "h-12 rounded-control border border-ink-200 bg-white px-4 text-[15px] text-ink-900 placeholder:text-ink-300 transition-colors focus-ring focus:border-brand-500",
            className,
          )}
          {...props}
        />
        {hint && <span className="text-xs text-ink-500">{hint}</span>}
      </div>
    );
  },
);
Input.displayName = "Input";
