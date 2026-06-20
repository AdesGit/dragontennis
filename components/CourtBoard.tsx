"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { Lightbulb } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Countdown } from "@/components/Countdown";
import { cn } from "@/lib/utils";

const DURATIONS = [30, 60] as const;

// One distinct colour per court, cycled by index. Full literal class strings so Tailwind
// keeps them (no dynamic concatenation).
const COURT_COLORS = [
  { border: "border-l-blue-500", text: "text-blue-600", btn: "bg-blue-600 hover:bg-blue-700" },
  { border: "border-l-emerald-500", text: "text-emerald-600", btn: "bg-emerald-600 hover:bg-emerald-700" },
  { border: "border-l-amber-500", text: "text-amber-600", btn: "bg-amber-600 hover:bg-amber-700" },
  { border: "border-l-fuchsia-500", text: "text-fuchsia-600", btn: "bg-fuchsia-600 hover:bg-fuchsia-700" },
] as const;

export function CourtBoard() {
  const me = useQuery(api.users.getMe);
  const courts = useQuery(api.courts.list);
  const active = useQuery(api.activations.activeCourts);
  const activate = useAction(api.activations.activateLight);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (me === undefined || courts === undefined || active === undefined) {
    return <p className="text-muted-foreground">Chargement…</p>;
  }

  const activeByCourt = new Map(active.map((a) => [a.court, a]));

  async function run(court: number, durationMin: number) {
    setBusy(`${court}-${durationMin}`);
    setMessage(null);
    try {
      const res = await activate({ court, durationMin });
      setMessage({
        ok: true,
        text: `Lumière allumée — ${res.amount} XPF débités, solde ${res.balanceAfter} XPF.`,
      });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Erreur" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4">
        {courts.map((c, i) => {
          const color = COURT_COLORS[i % COURT_COLORS.length];
          const live = activeByCourt.get(c.courtNumber);
          const litBy = live
            ? live.isMine
              ? "Vous"
              : [live.firstName, live.lastName].filter(Boolean).join(" ") || "Un membre"
            : null;
          return (
            <Card key={c._id} className={cn("border-l-4", color.border)}>
              <CardContent className="flex flex-col gap-3 pt-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className={cn("font-semibold", color.text)}>{c.label}</h2>
                  {live ? (
                    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", color.text)}>
                      <Lightbulb className="h-3.5 w-3.5" />
                      Allumé
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Disponible</span>
                  )}
                </div>

                {live ? (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{litBy}</span>
                      <span className="text-xs text-muted-foreground">Temps restant</span>
                    </div>
                    <Countdown
                      startTime={live.startTime}
                      endTime={live.endTime}
                      durationMin={live.durationMin}
                    />
                  </div>
                ) : (
                  <div className="flex gap-3">
                    {DURATIONS.map((d) => {
                      const bulbs = d === 30 ? 1 : 2;
                      return (
                        <button
                          key={d}
                          disabled={busy !== null}
                          onClick={() => run(c.courtNumber, d)}
                          className={cn(
                            "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-4 py-3 text-sm font-medium text-white transition-colors disabled:opacity-50",
                            color.btn,
                          )}
                        >
                          {busy === `${c.courtNumber}-${d}` ? (
                            "…"
                          ) : (
                            <>
                              <span className="flex items-center">
                                {Array.from({ length: bulbs }).map((_, k) => (
                                  <Lightbulb key={k} className="h-4 w-4" />
                                ))}
                              </span>
                              {d === 30 ? "30 min" : "1 h"}
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {message && (
        <p className={message.ok ? "text-sm text-green-600" : "text-sm text-red-600"}>
          {message.text}
        </p>
      )}
    </div>
  );
}
