"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";

export function CreditsPanel() {
  const members = useQuery(api.users.listMembers);
  const credit = useMutation(api.balance.creditAccount);
  const [userId, setUserId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  if (members === undefined) return <p>Chargement…</p>;

  return (
    <form
      className="flex max-w-md flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setMsg(null);
        try {
          const res = await credit({
            userId: userId as Id<"users">,
            amount: Number(amount),
            comment: comment || undefined,
          });
          setMsg(`Crédité. Nouveau solde : ${res.balanceAfter} XPF.`);
          setAmount("");
          setComment("");
        } catch (err) {
          setMsg(err instanceof Error ? err.message : "Erreur");
        }
      }}
    >
      <select
        required
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        className="rounded border border-gray-300 px-3 py-2"
      >
        <option value="">— Choisir un membre —</option>
        {members.map((m) => (
          <option key={m._id} value={m._id}>
            {m.firstName} {m.lastName} ({m.balance ?? 0} XPF)
          </option>
        ))}
      </select>
      <input
        type="number"
        min={1}
        required
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Montant (XPF)"
        className="rounded border border-gray-300 px-3 py-2"
      />
      <input
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Commentaire (ex: virement bancaire)"
        className="rounded border border-gray-300 px-3 py-2"
      />
      <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-white">
        Créditer
      </button>
      {msg && <p className="text-sm text-gray-700">{msg}</p>}
    </form>
  );
}
