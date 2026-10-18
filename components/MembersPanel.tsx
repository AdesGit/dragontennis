"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useMemo, useState } from "react";
import { ShieldCheck, ShieldOff, Trash2 } from "lucide-react";

import { Pagination, usePagination } from "@/components/ui/pagination";
import type { Id } from "@/convex/_generated/dataModel";

const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

const fullName = (m: { firstName?: string | null; lastName?: string | null; email?: string | null }) =>
  `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim() || m.email || "Membre";

export function MembersPanel() {
  const data = useQuery(api.users.listMembersWithPending);
  const me = useQuery(api.users.getMe);
  const createMember = useMutation(api.members.createMember);
  const setMemberRole = useMutation(api.members.setMemberRole);
  const deleteMember = useMutation(api.members.deleteMember);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const q = search.trim().toLowerCase();

  // Sort on last name then first name with a locale collator, so the accented
  // names used by the club order the same way as in a paper register.
  const members = useMemo(() => {
    const list = data?.members ?? [];
    return list
      .filter(
        (m) =>
          !q ||
          fullName(m).toLowerCase().includes(q) ||
          (m.email ?? "").toLowerCase().includes(q),
      )
      .slice()
      .sort(
        (a, b) =>
          collator.compare(a.lastName ?? "", b.lastName ?? "") ||
          collator.compare(a.firstName ?? "", b.firstName ?? "") ||
          collator.compare(a.email ?? "", b.email ?? ""),
      );
  }, [data?.members, q]);

  const pending = useMemo(() => {
    const list = data?.pending ?? [];
    return list
      .filter(
        (p) =>
          !q ||
          `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q),
      )
      .slice()
      .sort(
        (a, b) =>
          collator.compare(a.lastName ?? "", b.lastName ?? "") ||
          collator.compare(a.firstName ?? "", b.firstName ?? ""),
      );
  }, [data?.pending, q]);

  const memberPage = usePagination(members);
  const pendingPage = usePagination(pending);

  if (data === undefined || me === undefined) return <p>Chargement…</p>;

  async function toggleRole(userId: Id<"users">, current: "admin" | "user") {
    setActionMsg(null);
    setBusyId(userId);
    try {
      await setMemberRole({ userId, role: current === "admin" ? "user" : "admin" });
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusyId(null);
    }
  }

  async function removeMember(userId: Id<"users">, name: string) {
    if (!window.confirm(`Supprimer définitivement ${name} et tout son historique ?`)) return;
    setActionMsg(null);
    setBusyId(userId);
    try {
      await deleteMember({ userId });
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusyId(null);
    }
  }

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

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher un membre (nom, prénom, email)"
        className="max-w-md rounded border border-gray-300 px-3 py-2"
      />

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Membres ({members.length})</h2>
        {actionMsg && <p className="text-sm text-red-600">{actionMsg}</p>}
        <ul className="flex flex-col divide-y">
          {memberPage.visible.map((m) => {
            const isSelf = m._id === me?._id;
            const isAdmin = m.role === "admin";
            const name = fullName(m);
            return (
              <li key={m._id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                <span>
                  {name}{" "}
                  {isAdmin && (
                    <span className="rounded bg-accent/10 px-1.5 py-0.5 text-xs font-medium text-accent">
                      admin
                    </span>
                  )}
                  {isSelf && <span className="ml-1 text-xs text-muted-foreground">(vous)</span>}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">{m.balance ?? 0} XPF</span>
                  <button
                    onClick={() => toggleRole(m._id, isAdmin ? "admin" : "user")}
                    disabled={busyId !== null}
                    className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
                  >
                    {isAdmin ? (
                      <><ShieldOff className="h-3.5 w-3.5" /> Rétrograder</>
                    ) : (
                      <><ShieldCheck className="h-3.5 w-3.5" /> Promouvoir admin</>
                    )}
                  </button>
                  <button
                    onClick={() => removeMember(m._id, name)}
                    disabled={busyId !== null || isSelf}
                    title={isSelf ? "Vous ne pouvez pas vous supprimer" : "Supprimer"}
                    className="inline-flex items-center gap-1 rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Supprimer
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <Pagination
          page={memberPage.page}
          pageCount={memberPage.pageCount}
          pageSize={memberPage.pageSize}
          total={memberPage.total}
          onPage={memberPage.setPage}
          onPageSize={memberPage.setPageSize}
          label="membres"
        />
      </section>

      {pending.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">Invités en attente ({pending.length})</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {pendingPage.visible.map((p) => (
              <li key={p.email} className="flex justify-between border-b py-1 text-gray-500">
                <span>{p.firstName} {p.lastName} — {p.email}</span>
                <span>expire le {new Date(p.expiresAt).toLocaleDateString("fr-FR")}</span>
              </li>
            ))}
          </ul>
          <Pagination
            page={pendingPage.page}
            pageCount={pendingPage.pageCount}
            pageSize={pendingPage.pageSize}
            total={pendingPage.total}
            onPage={pendingPage.setPage}
            onPageSize={pendingPage.setPageSize}
            label="invitations"
          />
        </section>
      )}
    </div>
  );
}
