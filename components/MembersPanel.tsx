"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ShieldCheck, ShieldOff, Trash2 } from "lucide-react";

import { Pagination, usePagination } from "@/components/ui/pagination";
import type { Id } from "@/convex/_generated/dataModel";

const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

const fullName = (m: { firstName?: string | null; lastName?: string | null; email?: string | null }) =>
  `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim() || m.email || "Membre";

type SortKey = "lastName" | "firstName";
type SortDir = "asc" | "desc";
type Sort = { key: SortKey; dir: SortDir };

/** Sort on the chosen column, the other name column acting as tie-breaker. */
function compareNames(
  a: { firstName?: string | null; lastName?: string | null; email?: string | null },
  b: { firstName?: string | null; lastName?: string | null; email?: string | null },
  sort: Sort,
) {
  const other: SortKey = sort.key === "lastName" ? "firstName" : "lastName";
  const result =
    collator.compare(a[sort.key] ?? "", b[sort.key] ?? "") ||
    collator.compare(a[other] ?? "", b[other] ?? "") ||
    collator.compare(a.email ?? "", b.email ?? "");
  return sort.dir === "asc" ? result : -result;
}

/** Clickable table header showing the current sort direction with an arrow. */
function SortHeader({
  label, column, sort, onSort, className = "",
}: {
  label: string;
  column: SortKey;
  sort: Sort;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === column;
  return (
    <th scope="col" className={`px-3 py-2 text-left font-medium ${className}`}>
      <button
        type="button"
        onClick={() => onSort(column)}
        aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
        className="inline-flex items-center gap-1 hover:text-accent"
      >
        {label}
        {active ? (
          sort.dir === "asc" ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )
        ) : (
          <ChevronUp className="h-3.5 w-3.5 opacity-25" />
        )}
      </button>
    </th>
  );
}

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
  // Last name first, as in the club's paper register.
  const [sort, setSort] = useState<Sort>({ key: "lastName", dir: "asc" });
  const [pendingSort, setPendingSort] = useState<Sort>({ key: "lastName", dir: "asc" });

  const q = search.trim().toLowerCase();

  const toggleSort = (set: (s: Sort) => void, current: Sort) => (key: SortKey) =>
    set(current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });

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
      .sort((a, b) => compareNames(a, b, sort));
  }, [data?.members, q, sort]);

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
      .sort((a, b) => compareNames(a, b, pendingSort));
  }, [data?.pending, q, pendingSort]);

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
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead className="border-b text-gray-600">
              <tr>
                <SortHeader label="Nom" column="lastName" sort={sort}
                  onSort={toggleSort(setSort, sort)} />
                <SortHeader label="Prénom" column="firstName" sort={sort}
                  onSort={toggleSort(setSort, sort)} />
                <th scope="col" className="px-3 py-2 text-right font-medium">Solde</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {memberPage.visible.map((m) => {
                const isSelf = m._id === me?._id;
                const isAdmin = m.role === "admin";
                const name = fullName(m);
                return (
                  <tr key={m._id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium uppercase">
                      {m.lastName || "—"}
                      {isAdmin && (
                        <span className="ml-1.5 rounded bg-accent/10 px-1.5 py-0.5 text-xs font-medium normal-case text-accent">
                          admin
                        </span>
                      )}
                      {isSelf && (
                        <span className="ml-1 text-xs normal-case text-muted-foreground">(vous)</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{m.firstName || "—"}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{m.balance ?? 0} XPF</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-2">
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead className="border-b text-gray-600">
                <tr>
                  <SortHeader label="Nom" column="lastName" sort={pendingSort}
                    onSort={toggleSort(setPendingSort, pendingSort)} />
                  <SortHeader label="Prénom" column="firstName" sort={pendingSort}
                    onSort={toggleSort(setPendingSort, pendingSort)} />
                  <th scope="col" className="px-3 py-2 text-left font-medium">Email</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Expire le</th>
                </tr>
              </thead>
              <tbody className="divide-y text-gray-500">
                {pendingPage.visible.map((p) => (
                  <tr key={p.email} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium uppercase">{p.lastName || "—"}</td>
                    <td className="px-3 py-2">{p.firstName || "—"}</td>
                    <td className="px-3 py-2">{p.email}</td>
                    <td className="px-3 py-2 text-right">
                      {new Date(p.expiresAt).toLocaleDateString("fr-FR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
