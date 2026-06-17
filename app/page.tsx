"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AuthGate } from "@/components/AuthGate";
import { SignOutButton } from "@/components/SignOutButton";

export default function Home() {
  return (
    <AuthGate>
      <HomeContent />
    </AuthGate>
  );
}

function HomeContent() {
  const me = useQuery(api.users.getMe);
  return (
    <main className="mx-auto max-w-2xl p-6">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-bold">Dragon Tennis</h1>
        <SignOutButton />
      </header>
      {me ? (
        <p>
          Connecté : {me.firstName} {me.lastName} ({me.role}) — solde {me.balance ?? 0} XPF
        </p>
      ) : (
        <p>Chargement du profil…</p>
      )}
    </main>
  );
}
