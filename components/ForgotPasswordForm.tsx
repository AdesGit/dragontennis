"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";

export function ForgotPasswordForm() {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (sent) {
    return (
      <p className="max-w-sm text-center text-sm text-muted-foreground">
        Si un compte existe pour <strong>{email}</strong>, un email contenant un lien de
        réinitialisation vient d&apos;être envoyé. Cliquez sur le lien pour choisir un nouveau
        mot de passe (lien valable 15 minutes). Pensez à vérifier vos spams.
      </p>
    );
  }

  return (
    <form
      className="flex w-full max-w-sm flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);
        try {
          await signIn("password", { email, flow: "reset" });
          setSent(true);
        } catch {
          setError("Impossible d'envoyer l'email. Réessayez dans un instant.");
          setSubmitting(false);
        }
      }}
    >
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Votre email"
        className="rounded border border-input px-3 py-2"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50"
      >
        {submitting ? "Envoi…" : "Envoyer le lien de réinitialisation"}
      </button>
    </form>
  );
}
