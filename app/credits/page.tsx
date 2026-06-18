"use client";

import { AuthGate } from "@/components/AuthGate";
import { CreditsPanel } from "@/components/CreditsPanel";
import { AppShell } from "@/components/app/AppShell";

export default function CreditsPage() {
  return (
    <AuthGate>
      <AppShell title="Créditer un compte">
        <CreditsPanel />
      </AppShell>
    </AuthGate>
  );
}
