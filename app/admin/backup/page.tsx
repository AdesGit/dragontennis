"use client";

import { AdminGate } from "@/components/AdminGate";
import { AppShell } from "@/components/app/AppShell";
import { BackupPanel } from "@/components/BackupPanel";

export default function BackupPage() {
  return (
    <AdminGate>
      <AppShell title="Backup / Import">
        <BackupPanel />
      </AppShell>
    </AdminGate>
  );
}
