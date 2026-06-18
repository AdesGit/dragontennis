"use client";

import { AdminGate } from "@/components/AdminGate";
import { MembersPanel } from "@/components/MembersPanel";
import { AppShell } from "@/components/app/AppShell";

export default function MembersPage() {
  return (
    <AdminGate>
      <AppShell title="Membres">
        <MembersPanel />
      </AppShell>
    </AdminGate>
  );
}
