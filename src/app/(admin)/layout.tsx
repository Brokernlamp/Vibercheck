import type { ReactNode } from "react";
import { AppShell, workspaceNavigation } from "@/components/app-shell";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireAdmin();
  return (
    <AppShell
      user={user}
      workspace="Operations"
      nav={workspaceNavigation("operations")}
    >
      {children}
    </AppShell>
  );
}
