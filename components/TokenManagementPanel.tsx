"use client";

import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useEffect, useState } from "react";
import { KeyRound, RefreshCw, Trash2, LogIn } from "lucide-react";

// Maps the ?legrand=<reason> flag from the OAuth callback to a user-facing message.
const CALLBACK_MESSAGES: Record<string, { text: string; ok: boolean }> = {
  success: { text: "Token Legrand récupéré avec succès.", ok: true },
  missing_code: { text: "Réponse Netatmo incomplète (code manquant).", ok: false },
  bad_state: { text: "Session de login expirée — relancez le login.", ok: false },
  exchange_failed: {
    text: "Échec de l'échange du code avec Netatmo (vérifiez client secret / redirect URI).",
    ok: false,
  },
};

function fmt(ts: number): string {
  return new Date(ts).toLocaleString("fr-FR");
}

export function TokenManagementPanel() {
  const status = useQuery(api.legrandDb.tokenStatus);
  const startLogin = useAction(api.legrand.startLogin);
  const manualRefresh = useAction(api.legrand.manualRefresh);
  const clearTokens = useMutation(api.legrandDb.clearTokens);

  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState<null | "login" | "refresh" | "clear">(null);

  // Read the ?legrand=<reason> flag set by the callback (avoids useSearchParams
  // so the page needs no Suspense boundary), then strip it from the URL.
  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("legrand");
    if (!reason) return;
    setMsg(CALLBACK_MESSAGES[reason] ?? { text: `Retour Legrand: ${reason}`, ok: false });
    const clean = window.location.pathname;
    window.history.replaceState(null, "", clean);
  }, []);

  if (status === undefined) return <p>Chargement…</p>;

  const handleLogin = async () => {
    setBusy("login");
    setMsg(null);
    try {
      const { url } = await startLogin({});
      window.location.href = url;
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "Erreur", ok: false });
      setBusy(null);
    }
  };

  const handleRefresh = async () => {
    setBusy("refresh");
    setMsg(null);
    try {
      await manualRefresh({});
      setMsg({ text: "Token rafraîchi.", ok: true });
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "Erreur", ok: false });
    } finally {
      setBusy(null);
    }
  };

  const handleClear = async () => {
    if (!window.confirm("Supprimer tous les tokens Legrand stockés ?")) return;
    setBusy("clear");
    setMsg(null);
    try {
      const n = await clearTokens({});
      setMsg({ text: `${n} token(s) supprimé(s).`, ok: true });
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "Erreur", ok: false });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex max-w-xl flex-col gap-6">
      {status.dryRun && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Mode <strong>DRY-RUN</strong> : <code>NETATMO_CLIENT_ID</code> n&apos;est
          pas défini dans l&apos;env Convex. Le login et l&apos;allumage sont simulés
          tant que les identifiants ne sont pas renseignés.
        </div>
      )}

      {msg && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            msg.ok
              ? "border-green-300 bg-green-50 text-green-800"
              : "border-red-300 bg-red-50 text-red-800"
          }`}
        >
          {msg.text}
        </div>
      )}

      <section className="rounded-lg border p-4">
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <KeyRound className="h-4 w-4 text-primary" /> Token courant
        </h2>
        {status.hasToken ? (
          <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-gray-500">Statut</dt>
            <dd className={status.isExpired ? "text-red-600" : "text-green-600"}>
              {status.isExpired ? "Expiré (sera rafraîchi)" : "Valide"}
            </dd>
            <dt className="text-gray-500">Obtenu le</dt>
            <dd>{status.obtainedAt ? fmt(status.obtainedAt) : "—"}</dd>
            <dt className="text-gray-500">Expire le</dt>
            <dd>{fmt(status.expiresAt)}</dd>
            <dt className="text-gray-500">Access token</dt>
            <dd className="font-mono">
              {status.hasAccessToken ? status.accessTokenPreview : "(aucun — seed)"}
            </dd>
            <dt className="text-gray-500">Refresh token</dt>
            <dd className="font-mono">{status.refreshTokenPreview}</dd>
          </dl>
        ) : (
          <p className="text-sm text-gray-500">
            Aucun token stocké. Lancez « Login with Legrand » pour en obtenir un.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <button
          onClick={handleLogin}
          disabled={busy !== null}
          className="flex items-center justify-center gap-2 rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          <LogIn className="h-4 w-4" />
          {busy === "login" ? "Redirection…" : "Login with Legrand"}
        </button>

        <button
          onClick={handleRefresh}
          disabled={busy !== null || !status.hasToken}
          className="flex items-center justify-center gap-2 rounded border px-4 py-2 hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4" />
          {busy === "refresh" ? "Rafraîchissement…" : "Rafraîchir le token"}
        </button>

        <button
          onClick={handleClear}
          disabled={busy !== null || !status.hasToken}
          className="flex items-center justify-center gap-2 rounded border border-red-300 px-4 py-2 text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
          {busy === "clear" ? "Suppression…" : "Supprimer les tokens"}
        </button>
      </section>
    </div>
  );
}
