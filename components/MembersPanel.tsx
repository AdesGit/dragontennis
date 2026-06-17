"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";

export function MembersPanel() {
  const data = useQuery(api.users.listMembersWithPending);
  const createMember = useMutation(api.members.createMember);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  if (data === undefined) return <p>Chargement…</p>;

  return (
    <div className="flex flex-col gap-8">
      <form
        className="flex max-w-md flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setMsg(null);
          try {
            await createMember({ firstName, lastName, email });
            setFirstName(""); setLastName(""); setEmail("");
            setMsg("Invitation envoyée.");
          } catch (err) {
            setMsg(err instanceof Error ? err.message : "Erreur");
          }
        }}
      >
        <h2 className="font-semibold">Inviter un membre</h2>
        <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required
          placeholder="Prénom" className="rounded border border-gray-300 px-3 py-2" />
        <input value={lastName} onChange={(e) => setLastName(e.target.value)} required
          placeholder="Nom" className="rounded border border-gray-300 px-3 py-2" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} required type="email"
          placeholder="Email" className="rounded border border-gray-300 px-3 py-2" />
        <button className="rounded bg-blue-600 px-4 py-2 text-white">Inviter</button>
        {msg && <p className="text-sm text-gray-700">{msg}</p>}
      </form>

      <section>
        <h2 className="mb-2 font-semibold">Membres ({data.members.length})</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {data.members.map((m) => (
            <li key={m._id} className="flex justify-between border-b py-1">
              <span>{m.firstName} {m.lastName} {m.role === "admin" ? "(admin)" : ""}</span>
              <span className="text-gray-500">{m.balance ?? 0} XPF</span>
            </li>
          ))}
        </ul>
      </section>

      {data.pending.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Invités en attente ({data.pending.length})</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {data.pending.map((p) => (
              <li key={p.email} className="flex justify-between border-b py-1 text-gray-500">
                <span>{p.firstName} {p.lastName} — {p.email}</span>
                <span>expire le {new Date(p.expiresAt).toLocaleDateString("fr-FR")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
