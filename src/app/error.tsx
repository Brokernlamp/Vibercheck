"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("page_render_failed", {
      digest: error.digest,
      message: error.message,
    });
  }, [error]);

  return (
    <div className="mx-auto grid min-h-[60vh] max-w-[560px] place-items-center px-5 py-16 text-center">
      <div>
        <div className="mono-label">Request failed</div>
        <h1 className="mt-3 font-serif text-[38px] leading-tight tracking-[-0.03em]">
          Something broke on our side.
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          The error was logged with reference{" "}
          <span className="font-mono text-[11px] text-ink-soft">
            {error.digest ?? "unknown"}
          </span>
          . Nothing was silently saved; retry the action, and contact your
          operator if it keeps happening.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={reset} className="btn btn-primary">
            <RotateCcw size={14} aria-hidden />
            Try again
          </button>
          <Link href="/" className="btn btn-secondary">
            Back to safety
          </Link>
        </div>
      </div>
    </div>
  );
}
