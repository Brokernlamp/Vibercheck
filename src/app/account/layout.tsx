import type { ReactNode } from "react";
import { AppShell, workspaceNavigation } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { openAccess, soloMode } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <AppShell
      user={user}
      workspace="Account"
      nav={workspaceNavigation(
        soloMode() && openAccess()
          ? "developer"
          : user.role === "ADMIN"
          ? "operations"
          : user.role === "ANALYST"
            ? "analyst"
            : "developer",
      )}
    >
      {children}
    </AppShell>
  );
}
