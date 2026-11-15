import type { ReactNode } from "react";
import { AppShell, workspaceNavigation } from "@/components/app-shell";
import { requireStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AnalystLayout({ children }: { children: ReactNode }) {
  const user = await requireStaff();
  return (
    <AppShell
      user={user}
      workspace="Analyst desk"
      nav={workspaceNavigation("analyst")}
    >
      {children}
    </AppShell>
  );
}
