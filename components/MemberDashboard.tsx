"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CourtBoard } from "@/components/CourtBoard";

export function MemberDashboard() {
  const me = useQuery(api.users.getMe);
  const txns = useQuery(api.transactions.listForUser, {});

  if (me === undefined || txns === undefined) {
    return <p className="text-muted-foreground">Chargement…</p>;
  }

  const fullName = [me?.firstName, me?.lastName].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex items-center justify-between gap-3 pt-6">
          {fullName && <p className="text-base font-semibold">{fullName}</p>}
          <div className="flex flex-col items-end">
            <p className="text-sm text-muted-foreground">Solde actuel</p>
            <p className="text-xl font-bold text-accent">{me?.balance ?? 0} XPF</p>
          </div>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Activer une lumière
        </h2>
        <CourtBoard />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Historique</CardTitle>
        </CardHeader>
        <CardContent>
          {txns.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune transaction.</p>
          ) : (
            <ul className="flex flex-col gap-3 text-sm">
              {txns.slice(0, 10).map((t) => (
                <li
                  key={t._id}
                  className="flex items-center justify-between gap-3 border-b pb-3 last:border-b-0 last:pb-0"
                >
                  <span>
                    {t.type}
                    {t.comment ? ` · ${t.comment}` : ""}
                  </span>
                  <span className="font-medium">
                    {t.type === "credit" ? "+" : t.type === "debit" ? "−" : "±"}
                    {t.amount} XPF
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
