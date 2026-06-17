"use client";

import { AuthGate } from "@/components/AuthGate";
import { MemberDashboard } from "@/components/MemberDashboard";
import { NavBar } from "@/components/NavBar";

export default function DashboardPage() {
  return (
    <AuthGate>
      <main className="mx-auto max-w-2xl p-6">
        <NavBar title="Mon espace" />
        <MemberDashboard />
      </main>
    </AuthGate>
  );
}
