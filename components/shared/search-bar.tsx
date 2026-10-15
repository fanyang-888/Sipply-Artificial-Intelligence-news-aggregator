"use client";

import { uiInput } from "@/lib/ui/classes";

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  /** Shown above input when not compact. Default "Search". */
  label?: string;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  /** Extra classes for the non-compact label (e.g. muted / small). */
  labelClassName?: string;
  /** Omit label and use tighter spacing (e.g. top nav). */
  compact?: boolean;
  name?: string;
};

export function SearchBar({
  value,
  onChange,
  id = "app-search",
  label = "Search",
  placeholder = "Search…",
  className = "",
  inputClassName = "",
  labelClassName = "",
  compact = false,
  name = "q",
}: SearchBarProps) {
  const inputClasses = compact
    ? `${uiInput} h-8 w-full min-w-0 text-[12.5px] ${inputClassName}`
    : `${uiInput} w-full ${inputClassName}`;

  return (
    <div className={compact ? `min-w-0 ${className}` : `mb-4 ${className}`}>
      {!compact ? (
        <label
          htmlFor={id}
          className={`mb-1.5 block text-sm font-medium text-foreground ${labelClassName}`}
        >
          {label}
        </label>
      ) : null}
      <input
        id={id}
        name={name}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClasses}
        autoComplete="off"
      />
    </div>
  );
}
