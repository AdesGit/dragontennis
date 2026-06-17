"use client";

import { AdminGate } from "@/components/AdminGate";
import { FaqAdminPanel } from "@/components/FaqAdminPanel";
import { NavBar } from "@/components/NavBar";

export default function AdminFaqPage() {
  return (
    <AdminGate>
      <main className="mx-auto max-w-2xl p-6">
        <NavBar title="Gérer la FAQ" />
        <FaqAdminPanel />
      </main>
    </AdminGate>
  );
}
