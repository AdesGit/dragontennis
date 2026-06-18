"use client";

import { AuthGate } from "@/components/AuthGate";
import { MemberDashboard } from "@/components/MemberDashboard";
import { AppShell } from "@/components/app/AppShell";

export default function DashboardPage() {
  return (
    <AuthGate>
      <AppShell title="Mon espace">
        <MemberDashboard />
      </AppShell>
    </AuthGate>
  );
}
