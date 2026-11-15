import type { ReactNode } from "react";
import { AppShell, workspaceNavigation } from "@/components/app-shell";
import { requireClient } from "@/lib/auth";
import { soloMode } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const user = await requireClient();
  const solo = soloMode();
  return (
    <AppShell
      user={user}
      workspace={solo ? "My workspace" : "Client portal"}
      nav={workspaceNavigation("developer")}
    >
      {children}
    </AppShell>
  );
}
