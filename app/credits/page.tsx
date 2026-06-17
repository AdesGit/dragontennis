"use client";

import { AuthGate } from "@/components/AuthGate";
import { CreditsPanel } from "@/components/CreditsPanel";
import { SignOutButton } from "@/components/SignOutButton";

export default function CreditsPage() {
  return (
    <AuthGate>
      <main className="mx-auto max-w-2xl p-6">
        <header className="mb-8 flex items-center justify-between">
          <h1 className="text-xl font-bold">Créditer un compte</h1>
          <SignOutButton />
        </header>
        <CreditsPanel />
      </main>
    </AuthGate>
  );
}
