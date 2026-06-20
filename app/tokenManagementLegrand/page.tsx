"use client";

import { AdminGate } from "@/components/AdminGate";
import { AppShell } from "@/components/app/AppShell";
import { TokenManagementPanel } from "@/components/TokenManagementPanel";

export default function TokenManagementLegrandPage() {
  return (
    <AdminGate>
      <AppShell title="Tokens Legrand">
        <TokenManagementPanel />
      </AppShell>
    </AdminGate>
  );
}
