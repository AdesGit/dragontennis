"use client";

import { AuthGate } from "@/components/AuthGate";
import { ActivatePanel } from "@/components/ActivatePanel";
import { SignOutButton } from "@/components/SignOutButton";

export default function ActivatePage() {
  return (
    <AuthGate>
      <main className="mx-auto max-w-2xl p-6">
        <header className="mb-8 flex items-center justify-between">
          <h1 className="text-xl font-bold">Activer une lumière</h1>
          <SignOutButton />
        </header>
        <ActivatePanel />
      </main>
    </AuthGate>
  );
}
