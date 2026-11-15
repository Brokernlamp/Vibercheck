"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({
  href,
  label,
  index,
  exact = false,
  light = false,
}: {
  href: string;
  label: string;
  index: string;
  exact?: boolean;
  light?: boolean;
}) {
  const pathname = usePathname();
  const active = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);

  if (light) {
    return (
      <Link
        href={href}
        className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-[12px] font-semibold no-underline transition ${
          active
            ? "border-forest bg-forest text-lime"
            : "border-line bg-card text-ink-soft"
        }`}
      >
        {label}
      </Link>
    );
  }

  return (
    <Link href={href} className="nav-link" data-active={active}>
      <span className="nav-index">{index}</span>
      <span>{label}</span>
    </Link>
  );
}
