"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function AdminGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.getMe);
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/signin");
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (me && me.role !== "admin") router.replace("/dashboard");
  }, [me, router]);

  if (isLoading || !isAuthenticated || me === undefined) {
    return <div className="flex min-h-screen items-center justify-center">Chargement…</div>;
  }
  if (me?.role !== "admin") return null; // redirecting
  return <>{children}</>;
}
