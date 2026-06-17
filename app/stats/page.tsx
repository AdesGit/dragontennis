"use client";

import { AdminGate } from "@/components/AdminGate";
import { StatsPanel } from "@/components/StatsPanel";
import { NavBar } from "@/components/NavBar";

export default function StatsPage() {
  return (
    <AdminGate>
      <main className="mx-auto max-w-3xl p-6">
        <NavBar title="Statistiques" />
        <StatsPanel />
      </main>
    </AdminGate>
  );
}
