"use client";

import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";

const PRICES: Record<number, number> = { 30: 250, 60: 500 };

export function ActivatePanel() {
  const me = useQuery(api.users.getMe);
  const courts = useQuery(api.courts.list);
  const activate = useAction(api.activations.activateLight);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (me === undefined || courts === undefined) {
    return <p>Chargement…</p>;
  }

  async function run(court: number, durationMin: number) {
    const key = `${court}-${durationMin}`;
    setBusy(key);
    setMessage(null);
    try {
      const res = await activate({ court, durationMin });
      setMessage({ ok: true, text: `Lumière allumée — ${res.amount} XPF débités, solde ${res.balanceAfter} XPF.` });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Erreur" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-lg font-medium">Solde : {me?.balance ?? 0} XPF</p>
      <div className="grid gap-4">
        {courts.map((c) => (
          <div key={c._id} className="rounded-lg border border-gray-200 p-4">
            <h2 className="mb-3 font-semibold">{c.label}</h2>
            <div className="flex gap-3">
              {[30, 60].map((d) => (
                <button
                  key={d}
                  disabled={busy !== null}
                  onClick={() => run(c.courtNumber, d)}
                  className="flex-1 rounded bg-blue-600 px-4 py-3 text-white disabled:opacity-50"
                >
                  {busy === `${c.courtNumber}-${d}` ? "…" : `${d === 30 ? "30 min" : "1 h"} · ${PRICES[d]} XPF`}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {message && (
        <p className={message.ok ? "text-green-600" : "text-red-600"}>{message.text}</p>
      )}
    </div>
  );
}
