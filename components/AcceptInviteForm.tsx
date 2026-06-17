"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AcceptInviteForm({ token }: { token: string }) {
  const invite = useQuery(api.members.getInviteByToken, { token });
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (invite === undefined) return <p>Chargement…</p>;
  if (invite === null) return <p className="text-red-600">Invitation invalide ou expirée.</p>;

  return (
    <form
      className="flex w-full max-w-sm flex-col gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setSubmitting(true);
        setError(null);
        const formData = new FormData(event.currentTarget);
        formData.set("email", invite.email);
        formData.set("flow", "signUp");
        try {
          await signIn("password", formData);
          router.push("/");
        } catch {
          setError("Impossible de créer le compte. L'invitation est peut-être expirée.");
          setSubmitting(false);
        }
      }}
    >
      <p className="text-sm text-gray-600">
        Bienvenue {invite.firstName} {invite.lastName} — définissez votre mot de passe pour {invite.email}.
      </p>
      <input
        name="password"
        type="password"
        required
        minLength={8}
        placeholder="Mot de passe (8 caractères min.)"
        className="rounded border border-gray-300 px-3 py-2"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {submitting ? "Création…" : "Activer mon compte"}
      </button>
    </form>
  );
}
