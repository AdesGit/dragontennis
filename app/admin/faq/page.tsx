"use client";

import { AdminGate } from "@/components/AdminGate";
import { FaqAdminPanel } from "@/components/FaqAdminPanel";
import { AppShell } from "@/components/app/AppShell";

export default function AdminFaqPage() {
  return (
    <AdminGate>
      <AppShell title="Gérer la FAQ">
        <FaqAdminPanel />
      </AppShell>
    </AdminGate>
  );
}
