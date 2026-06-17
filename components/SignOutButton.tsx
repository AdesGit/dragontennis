"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const { signOut } = useAuthActions();
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await signOut();
        router.push("/signin");
      }}
      className="rounded px-3 py-1 text-sm text-gray-600 hover:text-gray-900"
    >
      Déconnexion
    </button>
  );
}
