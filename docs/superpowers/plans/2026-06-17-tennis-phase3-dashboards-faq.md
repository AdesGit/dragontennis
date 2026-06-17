# Dragon Tennis — Phase 3 : Dashboards + FAQ + Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the MVP on top of Phases 1–2: close the two reserve-first/cron hardening gaps the Phase 2 review flagged as must-fix-before-real-hardware, add the missing indexes, then deliver the admin statistics dashboard, the member dashboard, an admin-editable FAQ, the admin member list (including pending invitees), and an admin route guard + navigation.

**Architecture:** Backend stays Convex. Hardening: `activateLight`'s failure path now best-effort turns the light OFF before refunding, and a new 5-minute reaper cron reverses activations stuck in `pending` (action died mid-flow) — together these guarantee "no light on without a paid debit" and "no debit without service" once real Netatmo is live. Stats are computed by aggregating the append-only `transactions` + `activations` tables in a single admin query. FAQ content lives in the existing `faqEntries` table with admin CRUD. An `AdminGate` (role check via `getMe`) wraps admin pages; a shared `NavBar` links the app.

**Tech Stack:** Convex `1.34.x` (queries, internalAction, crons), `@convex-dev/auth` `0.0.91`, Next.js `15.3.6` / React `18` / Tailwind `3`.

## Global Constraints

Inherited by every task (verbatim from the spec / Phase 1–2 rules):

- **No `any` types.** Proper types or `unknown` + guards.
- **Tailwind utility classes only** — never `style={{}}`.
- **Every Convex function arg uses an explicit `v` validator.**
- **Public Convex functions check auth** via `getAuthUserId(ctx)`; admin-only via `requireAdmin(ctx)` (`convex/users.ts`); internal/cron functions skip auth.
- **Inside actions, call `internal.*` never `api.*`.**
- **`balance` is the single source of truth; `transactions` is append-only.** Stats are READ-ONLY aggregations — never recompute or mutate balances.
- **`"use node"` is the first line** of any Convex file using Node APIs; such files contain ONLY actions (DB access lives in a V8 sibling) — see Phase 2's `legrand.ts`/`legrandDb.ts` split.
- **Frontend:** components in `components/`, pages in `app/`; `"use client"` only where hooks are used; client components import the Convex API from `@/convex/_generated/api` and ids from `@/convex/_generated/dataModel`.
- **When adding a `convex/*.ts` module**, `npx convex deploy` regenerates `convex/_generated`; commit it.

**Testing approach:** No unit-test runner (MVP). Per-task verification = `npm run build`, `npm run lint`, `npx convex deploy` (local `http://127.0.0.1:3220`), and `npx convex run` for internal/unauthed functions. Re-export each shell:
```bash
export CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3220
export CONVEX_SELF_HOSTED_ADMIN_KEY="$(docker exec convex-tennis bash /convex/generate_admin_key.sh)"
```

**EXECUTION SCOPE — local-only (continues Phases 1–2):** Convex stays localhost-bound; public DNS/deploy and real Netatmo creds remain deferred to the supervised operator pass. **Admin-gated queries (`adminDashboard`, `listAll`, FAQ admin CRUD, member list) cannot be runtime-tested via `npx convex run`** — verifying a user JWT needs OIDC discovery at the public issuer (no DNS). Their auth guards are verified by the expected "Non authentifié" throw; their data-shape correctness is verified by code review + `npm run build` type-checking. **Public/internal functions ARE runnable** via `npx convex run` (FAQ `list`, `seedFaq`, the reaper internalAction, `dueActive`-style queries). A real admin user exists for reference: `kd7ctzr0hs85grxhg1f865vsdn88vems` (role admin, balance 0).

**Phase 1–2 facts this builds on:** Tables `users{role,balance?,status?}`, `transactions{type,amount,balanceBefore,balanceAfter,...,reversalOf?}` (index `by_user`), `activations{userId,court,status,startTime,endTime,amount,transactionId?}` (index `by_status`), `legrandTokens`, `courts` (index `by_court`), `faqEntries{question,answer,order,category?}`, `invites{email,token,role,firstName,lastName,expiresAt,used}` (indexes `by_email`,`by_token`). Functions: `requireAdmin`/`getMe`/`listMembers` (users.ts), `creditAccount`/`reverseTransaction` (balance.ts), `listForUser`/`listAll` (transactions.ts), `beginActivation`/`confirmActivation`/`failActivation`/`activateLight`/`listMine`/`listAll`/`dueActive`/`markUsed`/`turnoffDue` (activations.ts), `netatmoSetState`/`getValidToken`/`refreshToken` (legrand.ts), `crons.ts` (turnoff-due-lights 1m, refresh-legrand 30m). Existing UI: `/signin`, `/accept-invite/[token]`, `/forgot-password`, `/` (protected home), `/activate`, `/credits`, `/history`. Reusable components: `AuthGate`, `SignOutButton`.

---

### Task 1: Schema indexes (close Phase 2 perf debt)

**Files:**
- Modify: `/home/claude/dev/tennis/convex/schema.ts` (add 2 indexes)
- Modify: `/home/claude/dev/tennis/convex/activations.ts` (`listMine`/`listAll` use `by_user`)
- Modify: `/home/claude/dev/tennis/convex/balance.ts` (double-reversal guard uses `by_reversal`)

**Interfaces:**
- Produces: `activations` index `by_user` on `["userId"]`; `transactions` index `by_reversal` on `["reversalOf"]`. `listMine` and the `reverseTransaction` double-reversal guard become indexed lookups instead of full scans.

- [ ] **Step 1: Add the indexes in `schema.ts`**

In `convex/schema.ts`, add `.index("by_user", ["userId"])` to the `activations` table definition (it currently only has `by_status`), and add `.index("by_reversal", ["reversalOf"])` to the `transactions` table (it currently only has `by_user`). Example for activations:
```ts
  activations: defineTable({
    /* ...existing fields unchanged... */
  })
    .index("by_status", ["status"])
    .index("by_user", ["userId"]),
```
And for transactions:
```ts
  transactions: defineTable({
    /* ...existing fields unchanged... */
  })
    .index("by_user", ["userId"])
    .index("by_reversal", ["reversalOf"]),
```

- [ ] **Step 2: Use `by_user` in `activations.listMine`**

In `convex/activations.ts`, replace the full-scan `listMine` body:
```ts
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");
    const mine = await ctx.db
      .query("activations")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return mine.sort((a, b) => b.startTime - a.startTime);
  },
});
```
(`listAll` stays a full `.collect()` — it is admin-wide by design; leave it.)

- [ ] **Step 3: Use `by_reversal` in the double-reversal guard**

In `convex/balance.ts` `reverseTransaction`, replace the O(n) per-user scan with an indexed lookup:
```ts
    const existingReversal = await ctx.db
      .query("transactions")
      .withIndex("by_reversal", (q) => q.eq("reversalOf", transactionId))
      .first();
    if (existingReversal) throw new Error("Transaction déjà annulée");
```
(Remove the old `already`/`.some(...)` block this replaces.)

- [ ] **Step 4: Deploy and verify**

```bash
cd /home/claude/dev/tennis && npx convex deploy
npm run build && npm run lint
```
Expected: deploy reports the two added indexes; build + lint clean. (`reverseTransaction` is admin-gated — not runnable via `npx convex run`; its guard logic is verified by review.)

- [ ] **Step 5: Commit**

```bash
git add convex/schema.ts convex/activations.ts convex/balance.ts convex/_generated
git commit -m "perf(convex): add activations.by_user + transactions.by_reversal indexes"
```

---

### Task 2: Reserve-first hardening — turn-off-on-failure + stuck-pending reaper

> Closes the two Phase 2 final-review Important findings (free-light edge + no reaper). Required before real Netatmo goes live.

**Files:**
- Modify: `/home/claude/dev/tennis/convex/activations.ts` (best-effort off in `activateLight` catch; add `stuckPending` internalQuery + `reapStuck` internalAction)
- Modify: `/home/claude/dev/tennis/convex/crons.ts` (add `reap-stuck-pending` every 5 min)

**Interfaces:**
- Produces:
  - `activateLight` failure path best-effort turns the light OFF before refunding.
  - `internal.activations.stuckPending()` — internalQuery: `pending` activations older than a grace window.
  - `internal.activations.reapStuck()` — internalAction: for each stuck pending, best-effort turn OFF then `failActivation` (reverse the debit).
  - Cron `reap-stuck-pending` every 5 minutes.

- [ ] **Step 1: Best-effort turn-off in `activateLight`'s catch**

In `convex/activations.ts`, update the `catch` block of `activateLight` so a light that may have physically turned on (setstate succeeded but confirm threw) is turned back off before the refund:
```ts
    } catch (err: unknown) {
      // The light may have physically turned on (setstate ok, confirm failed). Best-effort
      // turn it off so we never leave a lit court that the cron won't catch (it only sweeps
      // "active"). Ignore off-errors — the reaper + turnoff cron are the backstop.
      try {
        await ctx.runAction(internal.legrand.netatmoSetState, {
          homeId: begun.homeId,
          moduleId: begun.moduleId,
          bridgeId: begun.bridgeId,
          on: false,
        });
      } catch {
        // swallow — refund proceeds regardless
      }
      await ctx.runMutation(internal.activations.failActivation, {
        activationId: begun.activationId,
        reason: err instanceof Error ? err.message : String(err),
      });
      throw new Error("Échec de l'allumage — votre compte a été recrédité.");
    }
```

- [ ] **Step 2: Add `stuckPending` + `reapStuck` to `activations.ts`**

Append (the `internalQuery`/`internalAction` imports already exist from Phase 2):
```ts
const STUCK_GRACE_MS = 3 * 60 * 1000; // an activateLight action cannot legitimately run this long

export const stuckPending = internalQuery({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - STUCK_GRACE_MS;
    const pending = await ctx.db
      .query("activations")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    return pending.filter((a) => a.startTime < cutoff);
  },
});

export const reapStuck = internalAction({
  args: {},
  handler: async (ctx) => {
    const stuck = await ctx.runQuery(internal.activations.stuckPending, {});
    for (const a of stuck) {
      // The action died mid-flow; the light state is uncertain. Best-effort turn off, then
      // reverse the debit (failActivation only acts on "pending", so this is idempotent).
      const courtRow = await ctx.runQuery(internal.courts.byNumber, { courtNumber: a.court });
      if (courtRow) {
        try {
          await ctx.runAction(internal.legrand.netatmoSetState, {
            homeId: courtRow.homeId,
            moduleId: courtRow.moduleId,
            bridgeId: courtRow.bridgeId,
            on: false,
          });
        } catch {
          // swallow
        }
      }
      await ctx.runMutation(internal.activations.failActivation, {
        activationId: a._id,
        reason: "Activation bloquée (pending) — recréditée par le reaper",
      });
    }
  },
});
```

- [ ] **Step 3: Register the reaper cron**

In `convex/crons.ts`, add:
```ts
crons.interval(
  "reap-stuck-pending",
  { minutes: 5 },
  internal.activations.reapStuck,
);
```

- [ ] **Step 4: Deploy and verify**

```bash
cd /home/claude/dev/tennis && npx convex deploy
npx convex run activations:stuckPending '{}'   # -> [] (no stuck activations)
npx convex run activations:reapStuck '{}'       # -> no-op, clean
npm run build && npm run lint
```
Expected: deploy registers the `reap-stuck-pending` cron; `stuckPending` returns `[]`; `reapStuck` runs clean; build + lint clean. (`failActivation`'s pending-only guard from Phase 2 means `reapStuck` re-running is idempotent.)

- [ ] **Step 5: Commit**

```bash
git add convex/activations.ts convex/crons.ts convex/_generated
git commit -m "fix(activations): turn-off-on-failure + stuck-pending reaper cron (closes Phase 2 hardware-pass reqs)"
```

---

### Task 3: Admin statistics dashboard

**Files:**
- Create: `/home/claude/dev/tennis/convex/stats.ts`
- Create: `/home/claude/dev/tennis/components/StatsPanel.tsx`
- Create: `/home/claude/dev/tennis/app/stats/page.tsx`

**Interfaces:**
- Produces: `api.stats.adminDashboard()` — admin query returning `{ activationsCount, revenue, creditsDistributed, activeUsers, failedCount }`, computed by aggregating the append-only ledger + activations.

- [ ] **Step 1: Write `stats.ts`**

`convex/stats.ts`:
```ts
import { query } from "./_generated/server";
import { requireAdmin } from "./users";

export const adminDashboard = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const txns = await ctx.db.query("transactions").collect();
    const activations = await ctx.db.query("activations").collect();
    const users = await ctx.db.query("users").collect();

    // Revenue = net amount actually paid for light usage. A debit is revenue; its reversal
    // (reversalOf set, on a debit) cancels it. Simplest correct net: sum debits, subtract
    // reversals that point at a debit.
    const debitById = new Map(
      txns.filter((t) => t.type === "debit").map((t) => [t._id, t]),
    );
    let revenue = 0;
    for (const t of txns) {
      if (t.type === "debit") revenue += t.amount;
      else if (t.type === "reversal" && t.reversalOf && debitById.has(t.reversalOf)) {
        revenue -= t.amount;
      }
    }

    // Credits distributed = sum of credit txns minus reversals pointing at a credit.
    const creditById = new Map(
      txns.filter((t) => t.type === "credit").map((t) => [t._id, t]),
    );
    let creditsDistributed = 0;
    for (const t of txns) {
      if (t.type === "credit") creditsDistributed += t.amount;
      else if (t.type === "reversal" && t.reversalOf && creditById.has(t.reversalOf)) {
        creditsDistributed -= t.amount;
      }
    }

    const activationsCount = activations.filter(
      (a) => a.status === "active" || a.status === "used",
    ).length;
    const failedCount = activations.filter((a) => a.status === "failed").length;

    // Active users = users who have at least one successful activation.
    const userIdsWithActivation = new Set(
      activations
        .filter((a) => a.status === "active" || a.status === "used")
        .map((a) => a.userId),
    );
    const activeUsers = userIdsWithActivation.size;

    return {
      activationsCount,
      failedCount,
      revenue,
      creditsDistributed,
      activeUsers,
      totalMembers: users.length,
    };
  },
});
```

- [ ] **Step 2: Write the stats panel + page**

`components/StatsPanel.tsx`:
```tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

export function StatsPanel() {
  const s = useQuery(api.stats.adminDashboard);
  if (s === undefined) return <p>Chargement…</p>;
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      <Card label="Activations" value={String(s.activationsCount)} />
      <Card label="Chiffre d'affaires" value={`${s.revenue} XPF`} />
      <Card label="Crédits distribués" value={`${s.creditsDistributed} XPF`} />
      <Card label="Membres actifs" value={String(s.activeUsers)} />
      <Card label="Membres total" value={String(s.totalMembers)} />
      <Card label="Échecs d'allumage" value={String(s.failedCount)} />
    </div>
  );
}
```

`app/stats/page.tsx`:
```tsx
"use client";

import { AdminGate } from "@/components/AdminGate";
import { StatsPanel } from "@/components/StatsPanel";
import { NavBar } from "@/components/NavBar";

export default function StatsPage() {
  return (
    <AdminGate>
      <main className="mx-auto max-w-3xl p-6">
        <NavBar title="Statistiques" />
        <StatsPanel />
      </main>
    </AdminGate>
  );
}
```
> `AdminGate` and `NavBar` are created in Task 7. Until then this page won't compile — implement Task 7 before building Task 3's page, OR temporarily wrap in `AuthGate` and import `NavBar` after Task 7. **Execution note:** do Task 7 first if executing strictly by build-gate; the task order below assumes Task 7's components exist when Task 3's page is built. (See Task 7 note.)

- [ ] **Step 3: Deploy + verify**

```bash
cd /home/claude/dev/tennis && npx convex deploy
npm run build && npm run lint
```
Expected: deploy clean; `adminDashboard` is admin-gated (auth throw under `npx convex run` is expected); build + lint clean once Task 7 components exist.

- [ ] **Step 4: Commit**

```bash
git add convex/stats.ts components/StatsPanel.tsx app/stats convex/_generated
git commit -m "feat(stats): admin dashboard — revenue, credits, activations, active users"
```

---

### Task 4: Member dashboard

**Files:**
- Create: `/home/claude/dev/tennis/components/MemberDashboard.tsx`
- Create: `/home/claude/dev/tennis/app/dashboard/page.tsx`
- Modify: `/home/claude/dev/tennis/app/page.tsx` (redirect home `/` → `/dashboard`, or render the dashboard)

**Interfaces:**
- Consumes: `api.users.getMe`, `api.transactions.listForUser`, `api.activations.listMine`, `api.faq.list` (Task 5).

- [ ] **Step 1: Write the member dashboard**

`components/MemberDashboard.tsx`:
```tsx
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
```

- [ ] **Step 2: Write the dashboard page and point home at it**

`app/dashboard/page.tsx`:
```tsx
"use client";

import { AuthGate } from "@/components/AuthGate";
import { MemberDashboard } from "@/components/MemberDashboard";
import { NavBar } from "@/components/NavBar";

export default function DashboardPage() {
  return (
    <AuthGate>
      <main className="mx-auto max-w-2xl p-6">
        <NavBar title="Mon espace" />
        <MemberDashboard />
      </main>
    </AuthGate>
  );
}
```

Replace `app/page.tsx` with a redirect to the dashboard (keeps `/` as the entry point):
```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);
  return null;
}
```

- [ ] **Step 3: Verify**

```bash
cd /home/claude/dev/tennis && npm run build && npm run lint
```
Expected: routes `/dashboard` + `/` present; build + lint clean (requires Task 7's `NavBar`; see Task 7 note).

- [ ] **Step 4: Commit**

```bash
git add components/MemberDashboard.tsx app/dashboard app/page.tsx
git commit -m "feat(ui): member dashboard (balance, recent activations, history) + home redirect"
```

---

### Task 5: Admin-editable FAQ

**Files:**
- Create: `/home/claude/dev/tennis/convex/faq.ts`
- Create: `/home/claude/dev/tennis/components/FaqList.tsx`
- Create: `/home/claude/dev/tennis/app/faq/page.tsx`
- Create: `/home/claude/dev/tennis/components/FaqAdminPanel.tsx`
- Create: `/home/claude/dev/tennis/app/admin/faq/page.tsx`

**Interfaces:**
- Produces:
  - `api.faq.list()` — PUBLIC query, entries ordered by `order`.
  - `internal.faq.seedFaq()` — internalMutation, idempotent seed of starter entries.
  - `api.faq.create/update/remove` — admin mutations.

- [ ] **Step 1: Write `faq.ts`**

`convex/faq.ts`:
```ts
import { v } from "convex/values";
import { mutation, internalMutation, query } from "./_generated/server";
import { requireAdmin } from "./users";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const entries = await ctx.db.query("faqEntries").collect();
    return entries.sort((a, b) => a.order - b.order);
  },
});

export const create = mutation({
  args: { question: v.string(), answer: v.string(), order: v.number(), category: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return ctx.db.insert("faqEntries", args);
  },
});

export const update = mutation({
  args: {
    id: v.id("faqEntries"),
    question: v.string(),
    answer: v.string(),
    order: v.number(),
    category: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...rest }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(id, rest);
  },
});

export const remove = mutation({
  args: { id: v.id("faqEntries") },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx);
    await ctx.db.delete(id);
  },
});

export const seedFaq = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("faqEntries").first();
    if (existing) return; // idempotent
    const entries = [
      {
        order: 1,
        category: "Lumières",
        question: "Comment allumer la lumière d'un court ?",
        answer:
          "Depuis « Activer une lumière », choisissez le court et la durée (30 min ou 1 h). " +
          "Le montant est débité de votre solde et la lumière s'allume. Elle s'éteint automatiquement à la fin.",
      },
      {
        order: 2,
        category: "Crédits",
        question: "Comment fonctionnent les crédits ?",
        answer:
          "Votre compte dispose d'un solde en XPF. Chaque activation débite : 250 XPF pour 30 min, 500 XPF pour 1 h. " +
          "Si le solde est insuffisant, la lumière ne s'allume pas.",
      },
      {
        order: 3,
        category: "Recharge",
        question: "Comment recharger mon compte ?",
        answer:
          "Effectuez un virement bancaire sur le compte du club en indiquant vos nom et prénom. " +
          "Un administrateur crédite ensuite votre solde dans l'application.",
      },
      {
        order: 4,
        category: "Abonnements",
        question: "Comment payer mon abonnement ?",
        answer:
          "Les abonnements se règlent auprès du bureau du club. Contactez un administrateur pour les modalités.",
      },
      {
        order: 5,
        category: "Général",
        question: "Une activation a échoué mais j'ai été débité ?",
        answer:
          "En cas d'échec d'allumage, votre compte est automatiquement recrédité. " +
          "Si le solde ne revient pas, contactez un administrateur.",
      },
    ];
    for (const e of entries) await ctx.db.insert("faqEntries", e);
  },
});
```

- [ ] **Step 2: Public FAQ list + page**

`components/FaqList.tsx`:
```tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export function FaqList() {
  const faq = useQuery(api.faq.list);
  if (faq === undefined) return <p>Chargement…</p>;
  if (faq.length === 0) return <p className="text-sm text-gray-500">Aucune question.</p>;
  return (
    <div className="flex flex-col gap-4">
      {faq.map((f) => (
        <details key={f._id} className="rounded-lg border border-gray-200 p-4">
          <summary className="cursor-pointer font-medium">{f.question}</summary>
          <p className="mt-2 whitespace-pre-line text-sm text-gray-700">{f.answer}</p>
        </details>
      ))}
    </div>
  );
}
```

`app/faq/page.tsx`:
```tsx
"use client";

import { AuthGate } from "@/components/AuthGate";
import { FaqList } from "@/components/FaqList";
import { NavBar } from "@/components/NavBar";

export default function FaqPage() {
  return (
    <AuthGate>
      <main className="mx-auto max-w-2xl p-6">
        <NavBar title="FAQ" />
        <FaqList />
      </main>
    </AuthGate>
  );
}
```

- [ ] **Step 3: Admin FAQ CRUD panel + page**

`components/FaqAdminPanel.tsx`:
```tsx
"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";

export function FaqAdminPanel() {
  const faq = useQuery(api.faq.list);
  const create = useMutation(api.faq.create);
  const remove = useMutation(api.faq.remove);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [order, setOrder] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  if (faq === undefined) return <p>Chargement…</p>;

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setMsg(null);
          try {
            await create({ question, answer, order: Number(order) || faq.length + 1 });
            setQuestion(""); setAnswer(""); setOrder("");
            setMsg("Question ajoutée.");
          } catch (err) {
            setMsg(err instanceof Error ? err.message : "Erreur");
          }
        }}
      >
        <input value={question} onChange={(e) => setQuestion(e.target.value)} required
          placeholder="Question" className="rounded border border-gray-300 px-3 py-2" />
        <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} required
          placeholder="Réponse" className="rounded border border-gray-300 px-3 py-2" />
        <input value={order} onChange={(e) => setOrder(e.target.value)} type="number"
          placeholder="Ordre (optionnel)" className="rounded border border-gray-300 px-3 py-2" />
        <button className="rounded bg-blue-600 px-4 py-2 text-white">Ajouter</button>
        {msg && <p className="text-sm text-gray-700">{msg}</p>}
      </form>

      <ul className="flex flex-col gap-2">
        {faq.map((f) => (
          <li key={f._id} className="flex items-start justify-between gap-3 border-b py-2">
            <div>
              <p className="font-medium">{f.order}. {f.question}</p>
              <p className="text-sm text-gray-600">{f.answer}</p>
            </div>
            <button
              onClick={async () => {
                if (!window.confirm("Supprimer cette question ?")) return;
                try { await remove({ id: f._id as Id<"faqEntries"> }); }
                catch (err) { setMsg(err instanceof Error ? err.message : "Erreur"); }
              }}
              className="shrink-0 text-red-600 hover:underline"
            >
              Supprimer
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

`app/admin/faq/page.tsx`:
```tsx
"use client";

import { AdminGate } from "@/components/AdminGate";
import { FaqAdminPanel } from "@/components/FaqAdminPanel";
import { NavBar } from "@/components/NavBar";

export default function AdminFaqPage() {
  return (
    <AdminGate>
      <main className="mx-auto max-w-2xl p-6">
        <NavBar title="Gérer la FAQ" />
        <FaqAdminPanel />
      </main>
    </AdminGate>
  );
}
```

- [ ] **Step 4: Deploy, seed, verify**

```bash
cd /home/claude/dev/tennis && npx convex deploy
npx convex run faq:seedFaq '{}'
npx convex run faq:list '{}'    # public query, runnable -> 5 entries ordered
npm run build && npm run lint
```
Expected: `seedFaq` inserts 5 entries (idempotent on re-run); `faq:list` returns them ordered by `order`; admin mutations are auth-gated (verified by review); build + lint clean.

- [ ] **Step 5: Commit**

```bash
git add convex/faq.ts components/FaqList.tsx components/FaqAdminPanel.tsx app/faq app/admin/faq convex/_generated
git commit -m "feat(faq): admin-editable FAQ — public list + admin CRUD + seed"
```

---

### Task 6: Admin member list (incl. pending invitees)

> Closes the Phase 1 final-review note: `listMembers` alone misses invited-but-not-yet-accepted members.

**Files:**
- Modify: `/home/claude/dev/tennis/convex/users.ts` (add `listMembersWithPending`)
- Create: `/home/claude/dev/tennis/components/MembersPanel.tsx`
- Create: `/home/claude/dev/tennis/app/members/page.tsx`

**Interfaces:**
- Produces:
  - `api.users.listMembersWithPending()` — admin query returning `{ members: <users[]>, pending: { email, firstName, lastName, expiresAt }[] }` (pending = unused, unexpired invites with no corresponding active user).
  - `/members` admin page: active members (name, balance, role) + a "Membres invités (en attente)" section + the existing `createMember` form.

- [ ] **Step 1: Add `listMembersWithPending` to `users.ts`**

Append to `convex/users.ts`:
```ts
export const listMembersWithPending = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const members = await ctx.db.query("users").collect();
    const memberEmails = new Set(members.map((m) => m.email).filter(Boolean));
    const invites = await ctx.db.query("invites").collect();
    const now = Date.now();
    const pending = invites
      .filter((i) => !i.used && i.expiresAt > now && !memberEmails.has(i.email))
      .map((i) => ({
        email: i.email,
        firstName: i.firstName,
        lastName: i.lastName,
        expiresAt: i.expiresAt,
      }));
    return { members, pending };
  },
});
```

- [ ] **Step 2: Members panel** (list + pending + create form)

`components/MembersPanel.tsx`:
```tsx
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
```

`app/members/page.tsx`:
```tsx
"use client";

import { AdminGate } from "@/components/AdminGate";
import { MembersPanel } from "@/components/MembersPanel";
import { NavBar } from "@/components/NavBar";

export default function MembersPage() {
  return (
    <AdminGate>
      <main className="mx-auto max-w-2xl p-6">
        <NavBar title="Membres" />
        <MembersPanel />
      </main>
    </AdminGate>
  );
}
```

- [ ] **Step 3: Verify**

```bash
cd /home/claude/dev/tennis && npx convex deploy
npm run build && npm run lint
```
Expected: deploy clean; `listMembersWithPending` is admin-gated (auth throw expected via `npx convex run`); build + lint clean.

- [ ] **Step 4: Commit**

```bash
git add convex/users.ts components/MembersPanel.tsx app/members convex/_generated
git commit -m "feat(members): admin member list with pending invitees + invite form"
```

---

### Task 7: AdminGate + shared NavBar (do this BEFORE building Tasks 3–6 pages)

> **Order note:** Tasks 3–6 pages import `AdminGate` and `NavBar`. If executing strictly by build-gate, implement this task FIRST (its components are pure UI with no backend deps), then the Task 3–6 pages compile. The plan lists it last only because it depends on knowing all the routes; the implementer should create it early.

**Files:**
- Create: `/home/claude/dev/tennis/components/AdminGate.tsx`
- Create: `/home/claude/dev/tennis/components/NavBar.tsx`

**Interfaces:**
- Produces:
  - `<AdminGate>` — wraps a page: requires auth AND `role === "admin"` (via `getMe`); redirects non-admins to `/dashboard`, unauthenticated to `/signin`.
  - `<NavBar title>` — shared header: title + role-aware links (member: Mon espace, Activer, FAQ; admin also: Membres, Créditer, Historique, Stats, Gérer FAQ) + `<SignOutButton>`.

- [ ] **Step 1: Write `AdminGate`**

`components/AdminGate.tsx`:
```tsx
"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function AdminGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.getMe);
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/signin");
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (me && me.role !== "admin") router.replace("/dashboard");
  }, [me, router]);

  if (isLoading || !isAuthenticated || me === undefined) {
    return <div className="flex min-h-screen items-center justify-center">Chargement…</div>;
  }
  if (me?.role !== "admin") return null; // redirecting
  return <>{children}</>;
}
```

- [ ] **Step 2: Write `NavBar`**

`components/NavBar.tsx`:
```tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";

const MEMBER_LINKS = [
  { href: "/dashboard", label: "Mon espace" },
  { href: "/activate", label: "Activer" },
  { href: "/faq", label: "FAQ" },
];
const ADMIN_LINKS = [
  { href: "/members", label: "Membres" },
  { href: "/credits", label: "Créditer" },
  { href: "/history", label: "Historique" },
  { href: "/stats", label: "Stats" },
  { href: "/admin/faq", label: "Gérer FAQ" },
];

export function NavBar({ title }: { title: string }) {
  const me = useQuery(api.users.getMe);
  const links = me?.role === "admin" ? [...MEMBER_LINKS, ...ADMIN_LINKS] : MEMBER_LINKS;
  return (
    <header className="mb-8 flex flex-col gap-3 border-b pb-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{title}</h1>
        <SignOutButton />
      </div>
      <nav className="flex flex-wrap gap-3 text-sm">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="text-blue-600 hover:underline">
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
```

- [ ] **Step 3: Verify**

```bash
cd /home/claude/dev/tennis && npm run build && npm run lint
```
Expected: build + lint clean. With Tasks 3–6 pages present, all routes compile and admin links render only for admins.

- [ ] **Step 4: Commit**

```bash
git add components/AdminGate.tsx components/NavBar.tsx
git commit -m "feat(ui): AdminGate role guard + shared role-aware NavBar"
```

---

## Self-Review

**1. Spec coverage (Phase 3 slice + carried-over items):**
- Dashboard admin (statistiques: nb activations, CA, crédits distribués, users actifs) → Task 3. ✓
- Dashboard utilisateur (solde, historique perso, activations récentes, FAQ via nav) → Task 4. ✓
- FAQ administrable (CRUD + contenu) → Task 5. ✓
- Recherche (déjà livrée Phase 2 `/history`); member/transaction search covered there. ✓
- Gestion membres (liste, création, recherche, **+ invités en attente**) → Task 6 (closes Phase 1 deferral). ✓
- Admin route guard + nav → Task 7. ✓
- **Phase 2 deferred hardening (free-light edge + stuck-pending reaper)** → Task 2. ✓
- **Phase 2 perf debt (missing indexes)** → Task 1. ✓
- Mobile-first responsive → all panels use responsive Tailwind (`grid-cols-2 sm:grid-cols-3`, `flex-wrap`, `max-w-*`). ✓
- Out of MVP still: weather, cameras (explicitly deferred since the spec). Password reset shipped in Phase 2.

**2. Placeholder scan:** No "TBD"/"implement later". The only ordering caveat (Task 7 before Tasks 3–6 pages) is explicitly called out in Task 3's page step and Task 7's header.

**3. Type consistency:** `adminDashboard` returns `{activationsCount,failedCount,revenue,creditsDistributed,activeUsers,totalMembers}` — consumed exactly by `StatsPanel`. `listMembersWithPending` returns `{members,pending}` — consumed by `MembersPanel`. `faq.list` shape (`question/answer/order`) consumed by `FaqList`/`FaqAdminPanel`. `AdminGate`/`NavBar` consumed by all Task 3–6 pages. Index names `by_user`/`by_reversal` match Task 1's schema additions and their query sites. `reapStuck`/`stuckPending`/`failActivation` wiring matches Phase 2's `failActivation` pending-only guard (idempotent reaping).

**Execution ordering reminder:** implement **Task 1 → Task 2 → Task 7 → Task 3 → Task 4 → Task 5 → Task 6** so every page's imported components exist at its build-gate. (Backend Tasks 1–2 first, shared UI Task 7 next, then the pages.)

**Verification limits (carried from Phase 1–2):** admin-gated queries (`adminDashboard`, `listAll`, FAQ admin CRUD, `listMembersWithPending`) can't be runtime-tested locally (DNS-gated JWT verification) — their auth guards are verified by the expected throw, data shapes by code review + `npm run build`. Public/internal functions (`faq.list`, `faq.seedFaq`, `stuckPending`, `reapStuck`) ARE runnable and are verified directly.

**Remaining deferred (operator pass, unchanged):** public DNS/deploy; real Netatmo creds + `legrand.seedLegrandToken` + real court module IDs; real Gmail creds for invite/reset email; funded auth E2E in a browser.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-17-tennis-phase3-dashboards-faq.md`. Execute with superpowers:subagent-driven-development on a fresh `phase3-dashboards-faq` branch (from `master`), in the order noted above (Tasks 1, 2, 7, then 3–6). After Phase 3 lands, the only remaining work is the supervised public-deploy / real-hardware operator pass (DNS, Netatmo creds + token + court IDs, Gmail creds, TLS, PM2) — at which point the deferred runtime E2E verifications execute against the live instance.
