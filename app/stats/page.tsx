"use client";

import { AdminGate } from "@/components/AdminGate";
import { StatsPanel } from "@/components/StatsPanel";
import { AppShell } from "@/components/app/AppShell";

export default function StatsPage() {
  return (
    <AdminGate>
      <AppShell title="Statistiques">
        <StatsPanel />
      </AppShell>
    </AdminGate>
  );
}
