"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useMemo, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";

import { Pagination, usePagination } from "@/components/ui/pagination";

const REASON_LABELS: Record<string, string> = {
  credit_admin: "Crédit administrateur",
  light_usage: "Allumage éclairage",
  light_extension: "Prolongation éclairage",
  refund_failed_activation: "Remboursement allumage échoué",
  reversal: "Annulation",
};

// Rows written before the `reason` backfill have none: show a dash rather than an empty cell.
const reasonLabel = (reason?: string) => (reason ? REASON_LABELS[reason] ?? reason : "—");

export function HistoryPanel() {
  const txns = useQuery(api.transactions.listAll);
  const members = useQuery(api.users.listMembers);
  const reverse = useMutation(api.balance.reverseTransaction);
  const [filter, setFilter] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const nameById = useMemo(
    () => new Map((members ?? []).map((m) => [m._id, `${m.firstName} ${m.lastName}`])),
    [members],
  );

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (txns ?? [])
      .filter((t) => {
        const name = (nameById.get(t.userId) ?? "").toLowerCase();
        return (
          !q ||
          name.includes(q) ||
          t.type.includes(q) ||
          reasonLabel(t.reason).toLowerCase().includes(q) ||
          (t.comment ?? "").toLowerCase().includes(q)
        );
      })
      .slice()
      // Most recent first: an admin reads the history from the top.
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [txns, nameById, filter]);

  const paged = usePagination(rows);

  if (txns === undefined || members === undefined) return <p>Chargement…</p>;

  return (
    <div className="flex flex-col gap-3">
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Rechercher (membre, type, raison, commentaire)"
        className="rounded border border-gray-300 px-3 py-2"
      />
      {msg && (
        <p className="rounded bg-gray-100 px-3 py-2 text-sm text-gray-700">{msg}</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-gray-500">
              <th className="py-2">Date</th><th>Membre</th><th>Type</th><th>Raison</th>
              <th>Montant</th><th>Avant</th><th>Après</th><th>Commentaire</th><th></th>
            </tr>
          </thead>
          <tbody>
            {paged.visible.map((t) => (
              <tr key={t._id} className="border-b">
                <td className="py-2">{new Date(t.createdAt).toLocaleString("fr-FR")}</td>
                <td>{nameById.get(t.userId) ?? "—"}</td>
                <td>{t.type}</td>
                <td>{reasonLabel(t.reason)}</td>
                <td>{t.amount}</td>
                <td>{t.balanceBefore}</td>
                <td>{t.balanceAfter}</td>
                <td className="text-gray-600">{t.comment ?? "—"}</td>
                <td>
                  {t.type !== "reversal" && (
                    <button
                      onClick={async () => {
                        if (!window.confirm("Annuler cette transaction ?")) return;
                        try {
                          await reverse({ transactionId: t._id as Id<"transactions"> });
                          setMsg("Transaction annulée.");
                        } catch (err: unknown) {
                          setMsg(err instanceof Error ? err.message : "Erreur lors de l'annulation.");
                        }
                      }}
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
      <Pagination
        page={paged.page}
        pageCount={paged.pageCount}
        pageSize={paged.pageSize}
        total={paged.total}
        onPage={paged.setPage}
        onPageSize={paged.setPageSize}
        label="écritures"
      />
    </div>
  );
}
