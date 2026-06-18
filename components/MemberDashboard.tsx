"use client";

import Link from "next/link";
import { Zap } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";

type ActivationStatus = "pending" | "active" | "used" | "failed";

const STATUS_VARIANT: Record<ActivationStatus, BadgeProps["variant"]> = {
  active: "default",
  used: "secondary",
  pending: "warning",
  failed: "destructive",
};

export function MemberDashboard() {
  const me = useQuery(api.users.getMe);
  const txns = useQuery(api.transactions.listForUser, {});
  const activations = useQuery(api.activations.listMine);

  if (me === undefined || txns === undefined || activations === undefined) {
    return <p className="text-muted-foreground">Chargement…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-1 pt-6">
          <p className="text-sm text-muted-foreground">Solde actuel</p>
          <p className="text-3xl font-extrabold text-accent">
            {me?.balance ?? 0} XPF
          </p>
        </CardContent>
      </Card>

      <Link
        href="/activate"
        className="inline-flex h-10 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto"
      >
        <Zap className="h-4 w-4" />
        Activer une lumière
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Activations récentes</CardTitle>
        </CardHeader>
        <CardContent>
          {activations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune activation.</p>
          ) : (
            <ul className="flex flex-col gap-3 text-sm">
              {activations.slice(0, 5).map((a) => (
                <li
                  key={a._id}
                  className="flex items-center justify-between gap-3 border-b pb-3 last:border-b-0 last:pb-0"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">
                      Court {a.court} · {a.durationMin} min
                    </span>
                    <span className="text-muted-foreground">
                      {new Date(a.startTime).toLocaleString("fr-FR")}
                    </span>
                  </div>
                  <Badge variant={STATUS_VARIANT[a.status]}>{a.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

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
