"use client";

import { AuthGate } from "@/components/AuthGate";
import { HistoryPanel } from "@/components/HistoryPanel";
import { AppShell } from "@/components/app/AppShell";

export default function HistoryPage() {
  return (
    <AuthGate>
      <AppShell title="Historique des transactions">
        <HistoryPanel />
      </AppShell>
    </AuthGate>
  );
}
