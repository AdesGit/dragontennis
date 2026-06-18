"use client";

import { AppNavbarDesktop } from "./AppNavbarDesktop";
import { BottomTabBar } from "./BottomTabBar";

export function AppShell({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <AppNavbarDesktop />
      <main className="mx-auto min-h-screen max-w-screen-lg px-4 pb-24 pt-4 md:pb-8">
        {title && <h1 className="mb-6 text-2xl font-bold">{title}</h1>}
        {children}
      </main>
      <BottomTabBar />
    </>
  );
}
