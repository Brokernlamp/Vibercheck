import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export function Logo({
  href = "/",
  inverted = false,
  compact = false,
}: {
  href?: string;
  inverted?: boolean;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2.5 no-underline"
      aria-label="VibeCheck home"
    >
      <span
        className={`grid h-8 w-8 place-items-center rounded-[7px] ${
          inverted ? "bg-lime text-forest" : "bg-forest text-lime"
        }`}
      >
        <ShieldCheck size={17} strokeWidth={2.2} aria-hidden />
      </span>
      {!compact && (
        <span className="text-[17px] font-semibold tracking-[-0.03em]">
          VibeCheck
        </span>
      )}
    </Link>
  );
}
