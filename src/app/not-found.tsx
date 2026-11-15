import Link from "next/link";
import { Logo } from "@/components/logo";
import { openAccess } from "@/lib/env";

export default function NotFound() {
  const open = openAccess();
  return (
    <div className="grid min-h-screen place-items-center bg-paper px-5">
      <div className="w-full max-w-[440px] text-center">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="mono-label">404 / Not found</div>
        <h1 className="mt-3 font-serif text-[38px] tracking-[-0.03em]">
          Nothing lives here.
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          {open
            ? "The page may have moved."
            : "The page may have moved, or your account may not have access to it."}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href={open ? "/portal" : "/login"} className="btn btn-primary">
            {open ? "Open workspace" : "Sign in"}
          </Link>
          <Link href="/" className="btn btn-secondary">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
