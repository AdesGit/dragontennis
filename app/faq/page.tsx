"use client";

import { AuthGate } from "@/components/AuthGate";
import { FaqList } from "@/components/FaqList";
import { AppShell } from "@/components/app/AppShell";

export default function FaqPage() {
  return (
    <AuthGate>
      <AppShell title="FAQ">
        <FaqList />
      </AppShell>
    </AuthGate>
  );
}
