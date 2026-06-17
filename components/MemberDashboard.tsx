"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export function MemberDashboard() {
  const me = useQuery(api.users.getMe);
  const txns = useQuery(api.transactions.listForUser, {});
  const activations = useQuery(api.activations.listMine);

  if (me === undefined || txns === undefined || activations === undefined) {
    return <p>Chargement…</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <p className="text-sm text-gray-500">Solde actuel</p>
        <p className="text-3xl font-bold">{me?.balance ?? 0} XPF</p>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Activations récentes</h2>
        {activations.length === 0 ? (
          <p className="text-sm text-gray-500">Aucune activation.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {activations.slice(0, 5).map((a) => (
              <li key={a._id} className="flex justify-between border-b py-1">
                <span>Court {a.court} · {a.durationMin} min</span>
                <span className="text-gray-500">
                  {new Date(a.startTime).toLocaleString("fr-FR")} · {a.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Historique</h2>
        {txns.length === 0 ? (
          <p className="text-sm text-gray-500">Aucune transaction.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {txns.slice(0, 10).map((t) => (
              <li key={t._id} className="flex justify-between border-b py-1">
                <span>{t.type}{t.comment ? ` · ${t.comment}` : ""}</span>
                <span className="text-gray-500">
                  {t.type === "credit" ? "+" : t.type === "debit" ? "−" : "±"}{t.amount} XPF
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
