"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingLabel = "Working…",
  variant = "primary",
  size = "md",
  name,
  value,
  className = "",
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "lime" | "danger" | "ghost";
  size?: "sm" | "md";
  name?: string;
  value?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={`btn btn-${variant} ${size === "sm" ? "btn-sm" : ""} ${className}`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
