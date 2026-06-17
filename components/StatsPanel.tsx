"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

export function StatsPanel() {
  const s = useQuery(api.stats.adminDashboard);
  if (s === undefined) return <p>Chargement…</p>;
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      <Card label="Activations" value={String(s.activationsCount)} />
      <Card label="Chiffre d'affaires" value={`${s.revenue} XPF`} />
      <Card label="Crédits distribués" value={`${s.creditsDistributed} XPF`} />
      <Card label="Membres actifs" value={String(s.activeUsers)} />
      <Card label="Membres total" value={String(s.totalMembers)} />
      <Card label="Échecs d'allumage" value={String(s.failedCount)} />
    </div>
  );
}
