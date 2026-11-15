import type { ReactNode } from "react";
import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";
import type { SessionUser } from "@/lib/auth";
import { openAccess, soloMode } from "@/lib/env";
import { Logo } from "./logo";
import { NavLink } from "./nav-link";

export interface NavItem {
  href: string;
  label: string;
  exact?: boolean;
}

export function workspaceNavigation(
  workspace: "operations" | "analyst" | "developer",
): NavItem[] {
  if (workspace === "operations") {
    return [
      { href: "/admin", label: "Overview", exact: true },
      { href: "/admin/clients", label: "Projects" },
      { href: "/admin/audit-log", label: "Audit log" },
    ];
  }
  if (workspace === "analyst") {
    return [
      { href: "/analyst", label: "Review queue" },
      { href: "/analyst/rules", label: "Ruleset" },
    ];
  }
  if (soloMode()) {
    return [
      { href: "/portal", label: "My projects", exact: true },
      { href: "/portal/new", label: "New scan", exact: true },
    ];
  }
  return [
    { href: "/portal", label: "My audits", exact: true },
    { href: "/portal/new", label: "New audit", exact: true },
    { href: "/portal/billing", label: "Plan" },
  ];
}

export function AppShell({
  user,
  nav,
  workspace,
  children,
}: {
  user: SessionUser;
  nav: NavItem[];
  workspace: string;
  children: ReactNode;
}) {
  const open = openAccess();
  const solo = soloMode();

  const initials = user.name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const roleLabel =
    solo
      ? "Freelancer"
      : user.role === "ADMIN"
      ? "Operator"
      : user.role === "ANALYST"
        ? "Security analyst"
        : "Developer";

  const navigation = nav;
  const workspaces: NavItem[] =
    user.role === "ADMIN"
      ? [
          { href: "/admin", label: "Operations" },
          { href: "/analyst", label: "Analyst desk" },
          ...(open ? [{ href: "/portal", label: "Developer portal" }] : []),
        ]
      : user.role === "ANALYST"
        ? [{ href: "/analyst", label: "Analyst desk" }]
        : [{ href: "/portal", label: "Developer portal" }];
  const showWorkspaceSwitcher = !solo && workspaces.length > 1;
  const accountItem = { href: "/account/security", label: "Security & sessions" };

  return (
    <div className="min-h-screen bg-paper lg:flex">
      <aside className="sticky top-0 hidden h-screen w-[272px] shrink-0 flex-col border-r border-[#26342b] bg-forest px-5 py-6 text-paper lg:flex">
        <div className="px-1">
          <Logo href={solo ? "/portal" : "/"} inverted />
        </div>

        <div className="mt-8 rounded-xl border border-[#2b3a30] bg-[#17221b] px-3.5 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-lime shadow-[0_0_10px_rgba(201,244,91,0.5)]" />
            <div className="mono-label text-[9px] text-[#91a094]">{workspace}</div>
          </div>
          <div className="mt-2 truncate text-[13px] font-semibold text-[#f0f1e8]">
            {user.orgName ?? "VibeCheck"}
          </div>
          <div className="mt-1 truncate text-[10px] text-[#829186]">{roleLabel}</div>
        </div>

        {showWorkspaceSwitcher && (
          <section className="mt-7" aria-label="Switch workspace">
            <div className="mono-label px-2 text-[9px] text-[#76877b]">
              Switch workspace
            </div>
            <nav className="mt-2 flex flex-col gap-1">
              {workspaces.map((item, index) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  index={String(index + 1).padStart(2, "0")}
                />
              ))}
            </nav>
          </section>
        )}

        <section className="mt-7">
          <div className="mono-label px-2 text-[9px] text-[#76877b]">Navigate</div>
          <nav className="mt-2 flex flex-col gap-1" aria-label="Primary">
            {navigation.map((item, index) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                index={String(index + 1).padStart(2, "0")}
                exact={item.exact}
              />
            ))}
          </nav>
        </section>

        <div className="mt-auto border-t border-[#2b3a30] pt-4">
          <NavLink href={accountItem.href} label={accountItem.label} index="" />
          <div className="mt-4 flex items-center gap-2.5 px-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#3a4a3f] bg-[#1e2b23] font-mono text-[10px] text-lime">
              {initials || "VC"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-semibold text-[#e8eadf]">
                {user.name}
              </div>
              <div className="truncate text-[10px] text-[#8fa092]">{user.email}</div>
            </div>
          </div>
          {!open && (
            <form action={logoutAction} className="mt-3 px-2">
              <button
                type="submit"
                className="text-[11px] font-medium text-[#9fb0a2] underline decoration-[#44554a] underline-offset-4 transition hover:text-paper"
              >
                Sign out
              </button>
            </form>
          )}
          {solo && (
            <div className="mono-label mt-4 px-2 text-[8px] text-[#5f7265]">
              Solo mode active
            </div>
          )}
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="no-print border-b border-line bg-paper/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <Logo href={solo ? "/portal" : "/"} />
            <div className="flex items-center gap-3">
              <Link
                href={accountItem.href}
                className="text-[11px] font-semibold text-muted"
              >
                Account
              </Link>
              {!open && (
                <form action={logoutAction}>
                  <button type="submit" className="text-[11px] font-semibold text-muted">
                    Sign out
                  </button>
                </form>
              )}
            </div>
          </div>
          {showWorkspaceSwitcher && (
            <nav
              className="mt-4 flex gap-1.5 overflow-x-auto pb-1"
              aria-label="Switch workspace"
            >
              {workspaces.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  index=""
                  light
                />
              ))}
            </nav>
          )}
          <nav
            className={`${showWorkspaceSwitcher ? "mt-2" : "mt-4"} flex gap-1.5 overflow-x-auto pb-1`}
            aria-label="Primary"
          >
            {navigation.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                index=""
                exact={item.exact}
                light
              />
            ))}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-[1180px] px-4 py-6 md:px-8 md:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
