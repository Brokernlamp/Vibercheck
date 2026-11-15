import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, Inbox } from "lucide-react";
import { PATH_PRECISION, classifyPath } from "@/lib/scan/paths";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-col gap-5 border-b border-line pb-6 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        {eyebrow && <div className="mono-label mb-2.5">{eyebrow}</div>}
        <h1 className="font-serif text-[34px] leading-[1.05] tracking-[-0.035em] md:text-[40px]">
          {title}
        </h1>
        {description && (
          <p className="mt-3 max-w-xl text-[13.5px] leading-relaxed text-muted">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  detail,
  accent = false,
  href,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  accent?: boolean;
  href?: string;
}) {
  const content = (
    <div
      className={`flex h-full flex-col justify-between rounded-xl border p-4 ${
        accent
          ? "border-forest bg-forest text-paper"
          : "border-line bg-card text-ink"
      }`}
    >
      <div className={`mono-label ${accent ? "text-[#9fb39f]" : ""}`}>{label}</div>
      <div className="mt-4 flex items-end justify-between gap-2">
        <div className="font-serif text-[32px] leading-none tracking-[-0.04em]">
          {value}
        </div>
        {detail && (
          <div
            className={`text-right text-[10.5px] leading-snug ${
              accent ? "text-[#b7c9b6]" : "text-muted"
            }`}
          >
            {detail}
          </div>
        )}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block no-underline transition hover:-translate-y-0.5">
      {content}
    </Link>
  ) : (
    content
  );
}

export function Notice({
  message,
  tone = "success",
  className = "",
}: {
  message: string;
  tone?: "success" | "error" | "info";
  className?: string;
}) {
  const styles = {
    success: "border-success/25 bg-success-soft text-success",
    error: "border-critical/25 bg-critical-soft text-critical",
    info: "border-line bg-paper-deep text-ink-soft",
  }[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-lg border px-3.5 py-2.5 text-[12.5px] leading-snug ${styles} ${className}`}
    >
      {message}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-line-strong bg-card/60 px-6 py-14 text-center">
      <div className="mb-3 grid h-10 w-10 place-items-center rounded-full border border-line bg-paper text-muted">
        <Inbox size={17} aria-hidden />
      </div>
      <h3 className="font-serif text-xl">{title}</h3>
      <p className="mt-1.5 max-w-md text-[12.5px] leading-relaxed text-muted">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * Marks a finding that came from example, test, docs, vendored, or generated
 * code, so an analyst knows why its confidence and severity were reduced.
 */
export function PathKindBadge({ filePath }: { filePath: string }) {
  const kind = classifyPath(filePath);
  if (kind === "production") return null;
  const profile = PATH_PRECISION[kind];
  return (
    <span
      className="chip"
      title={`${profile.reason} Confidence and severity were reduced for this location.`}
    >
      {profile.label}
    </span>
  );
}

export function TextLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1 text-[12.5px] font-semibold underline decoration-line-strong underline-offset-4 transition hover:decoration-ink ${className}`}
    >
      {children}
      <ArrowUpRight size={13} aria-hidden />
    </Link>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3.5 flex items-end justify-between gap-3">
      <div>
        {eyebrow && <div className="mono-label mb-1.5">{eyebrow}</div>}
        <h2 className="font-serif text-[23px] leading-tight tracking-[-0.025em]">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}
