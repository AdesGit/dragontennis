"use client";

import Link from "next/link";
import {
  BarChart3,
  HelpCircle,
  Receipt,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { AdminGate } from "@/components/AdminGate";
import { AppShell } from "@/components/app/AppShell";
import { StatsPanel } from "@/components/StatsPanel";

type AdminTile = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const TILES: AdminTile[] = [
  { href: "/stats", label: "Stats", icon: BarChart3 },
  { href: "/members", label: "Membres", icon: Users },
  { href: "/credits", label: "Créditer", icon: Wallet },
  { href: "/history", label: "Historique", icon: Receipt },
  { href: "/admin/faq", label: "Gérer FAQ", icon: HelpCircle },
];

export default function AdminPage() {
  return (
    <AdminGate>
      <AppShell title="Admin">
        <div className="flex flex-col gap-8">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {TILES.map((tile) => {
              const Icon = tile.icon;
              return (
                <Link
                  key={tile.href}
                  href={tile.href}
                  className="flex flex-col gap-2 rounded-lg border p-4 hover:bg-muted"
                >
                  <Icon className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium">{tile.label}</span>
                </Link>
              );
            })}
          </div>

          <section className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">Aperçu</h2>
            <StatsPanel />
          </section>
        </div>
      </AppShell>
    </AdminGate>
  );
}
