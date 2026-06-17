"use client";

import { AuthGate } from "@/components/AuthGate";
import { HistoryPanel } from "@/components/HistoryPanel";
import { SignOutButton } from "@/components/SignOutButton";

export default function HistoryPage() {
  return (
    <AuthGate>
      <main className="mx-auto max-w-4xl p-6">
        <header className="mb-8 flex items-center justify-between">
          <h1 className="text-xl font-bold">Historique des transactions</h1>
          <SignOutButton />
        </header>
        <HistoryPanel />
      </main>
    </AuthGate>
  );
}
