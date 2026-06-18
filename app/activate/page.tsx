"use client";

import { AuthGate } from "@/components/AuthGate";
import { ActivatePanel } from "@/components/ActivatePanel";
import { AppShell } from "@/components/app/AppShell";

export default function ActivatePage() {
  return (
    <AuthGate>
      <AppShell title="Activer une lumière">
        <ActivatePanel />
      </AppShell>
    </AuthGate>
  );
}
