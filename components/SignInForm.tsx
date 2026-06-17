"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function SignInForm() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      className="flex w-full max-w-sm flex-col gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setSubmitting(true);
        setError(null);
        const formData = new FormData(event.currentTarget);
        formData.set("flow", "signIn");
        try {
          await signIn("password", formData);
          router.push("/");
        } catch {
          setError("Email ou mot de passe incorrect.");
          setSubmitting(false);
        }
      }}
    >
      <input
        name="email"
        type="email"
        required
        placeholder="Email"
        className="rounded border border-gray-300 px-3 py-2"
      />
      <input
        name="password"
        type="password"
        required
        placeholder="Mot de passe"
        className="rounded border border-gray-300 px-3 py-2"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {submitting ? "Connexion…" : "Se connecter"}
      </button>
      <a href="/forgot-password" className="text-center text-sm text-blue-600">
        Mot de passe oublié ?
      </a>
    </form>
  );
}
