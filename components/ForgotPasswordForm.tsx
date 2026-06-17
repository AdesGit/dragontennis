"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function ForgotPasswordForm() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [step, setStep] = useState<"request" | "verify">("request");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (step === "request") {
    return (
      <form
        className="flex w-full max-w-sm flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            await signIn("password", { email, flow: "reset" });
            setStep("verify");
          } catch {
            setError("Impossible d'envoyer le code.");
          }
        }}
      >
        <input
          type="email" required value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email" className="rounded border border-gray-300 px-3 py-2"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="rounded bg-blue-600 px-4 py-2 text-white">Envoyer le code</button>
      </form>
    );
  }

  return (
    <form
      className="flex w-full max-w-sm flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const fd = new FormData(e.currentTarget);
        try {
          await signIn("password", {
            email,
            code: String(fd.get("code")),
            newPassword: String(fd.get("newPassword")),
            flow: "reset-verification",
          });
          router.push("/");
        } catch {
          setError("Code invalide ou expiré.");
        }
      }}
    >
      <input name="code" required placeholder="Code reçu par email"
        className="rounded border border-gray-300 px-3 py-2" />
      <input name="newPassword" type="password" required minLength={8}
        placeholder="Nouveau mot de passe" className="rounded border border-gray-300 px-3 py-2" />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="rounded bg-blue-600 px-4 py-2 text-white">Réinitialiser</button>
    </form>
  );
}
