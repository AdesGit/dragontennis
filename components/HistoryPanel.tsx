"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";

export function HistoryPanel() {
  const txns = useQuery(api.transactions.listAll);
  const members = useQuery(api.users.listMembers);
  const reverse = useMutation(api.balance.reverseTransaction);
  const [filter, setFilter] = useState("");

  if (txns === undefined || members === undefined) return <p>Chargement…</p>;
  const nameById = new Map(members.map((m) => [m._id, `${m.firstName} ${m.lastName}`]));
  const q = filter.toLowerCase();
  const rows = txns.filter((t) => {
    const name = (nameById.get(t.userId) ?? "").toLowerCase();
    return !q || name.includes(q) || t.type.includes(q) || (t.comment ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col gap-3">
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Rechercher (membre, type, commentaire)"
        className="rounded border border-gray-300 px-3 py-2"
      />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-gray-500">
              <th className="py-2">Date</th><th>Membre</th><th>Type</th>
              <th>Montant</th><th>Avant</th><th>Après</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t._id} className="border-b">
                <td className="py-2">{new Date(t.createdAt).toLocaleString("fr-FR")}</td>
                <td>{nameById.get(t.userId) ?? "—"}</td>
                <td>{t.type}</td>
                <td>{t.amount}</td>
                <td>{t.balanceBefore}</td>
                <td>{t.balanceAfter}</td>
                <td>
                  {t.type !== "reversal" && (
                    <button
                      onClick={() => reverse({ transactionId: t._id as Id<"transactions"> })}
                      className="text-red-600 hover:underline"
                    >
                      Annuler
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
