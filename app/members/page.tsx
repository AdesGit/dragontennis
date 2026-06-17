"use client";

import { AdminGate } from "@/components/AdminGate";
import { MembersPanel } from "@/components/MembersPanel";
import { NavBar } from "@/components/NavBar";

export default function MembersPage() {
  return (
    <AdminGate>
      <main className="mx-auto max-w-2xl p-6">
        <NavBar title="Membres" />
        <MembersPanel />
      </main>
    </AdminGate>
  );
}
