"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function ResetPasswordForm() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  const code = params.get("code") ?? "";
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!email || !code) {
    return (
      <p className="max-w-sm text-center text-sm text-destructive">
        Lien invalide ou incomplet. Demandez un nouveau lien depuis « Mot de passe oublié ».
      </p>
    );
  }

  return (
    <form
      className="flex w-full max-w-sm flex-col gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setSubmitting(true);
        setError(null);
        const fd = new FormData(event.currentTarget);
        try {
          await signIn("password", {
            email,
            code,
            newPassword: String(fd.get("newPassword")),
            flow: "reset-verification",
          });
          router.push("/");
        } catch {
          setError("Lien invalide ou expiré. Demandez un nouveau lien de réinitialisation.");
          setSubmitting(false);
        }
      }}
    >
      <p className="text-sm text-muted-foreground">
        Choisissez un nouveau mot de passe pour <strong>{email}</strong>.
      </p>
      <input
        name="newPassword"
        type="password"
        required
        minLength={8}
        placeholder="Nouveau mot de passe (8 caractères min.)"
        className="rounded border border-input px-3 py-2"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50"
      >
        {submitting ? "Réinitialisation…" : "Réinitialiser"}
      </button>
    </form>
  );
}
