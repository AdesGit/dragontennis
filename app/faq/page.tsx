"use client";

import { AuthGate } from "@/components/AuthGate";
import { FaqList } from "@/components/FaqList";
import { NavBar } from "@/components/NavBar";

export default function FaqPage() {
  return (
    <AuthGate>
      <main className="mx-auto max-w-2xl p-6">
        <NavBar title="FAQ" />
        <FaqList />
      </main>
    </AuthGate>
  );
}
