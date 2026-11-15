"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function ScanRefresher({
  active,
  className = "",
}: {
  active: boolean;
  className?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(() => {
      router.refresh();
    }, 2500);
    return () => window.clearInterval(interval);
  }, [active, router]);

  if (!active) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-low ${className}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-low opacity-70" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-low" />
      </span>
      Live
    </span>
  );
}
