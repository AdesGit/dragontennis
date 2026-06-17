# Dragon Tennis — Phase 2 : Solde + Activation Legrand — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On top of Phase 1's auth, deliver the money + light-activation core: an admin credits/reverses member accounts; a member activates a court light, which atomically reserves the cost (debit + immutable ledger entry) before calling Legrand/Netatmo and auto-reverses on hardware failure; lights auto-turn-off when due; OAuth tokens refresh on a cron.

**Architecture:** All money + activation logic lives in Convex. The activation uses a **reserve-first** pattern: an atomic mutation re-checks balance, debits, writes a ledger `debit` and a `pending` activation; a `"use node"` action then calls Netatmo `setstate`; a confirm mutation flips the activation to `active`, or a fail mutation reverses the debit (immutable `reversal` entry) and marks it `failed`. This guarantees no negative balance and no free lights — strictly safer than the spec's literal "debit after setstate" ordering. Token storage is the `legrandTokens` table (Phase 1 schema); a cron refreshes proactively and `getValidToken` refreshes lazily with a 60s safety margin (ported from padel `TurnOnDevice.js`). Auto-turn-off is a 1-minute cron.

**Tech Stack:** Convex `1.34.x` (actions, mutations, crons, scheduler), `@convex-dev/auth` `0.0.91`, `axios` (Netatmo HTTP — add to deps), Next.js `15.3.6` / React `18.3.1` / Tailwind `3` frontend.

## Global Constraints

Inherited by every task (verbatim from the spec / Phase 1 rules):

- **No `any` types.** Proper types or `unknown` + guards.
- **Tailwind utility classes only** — never `style={{}}`.
- **Every Convex function arg uses an explicit `v` validator.**
- **Public Convex functions check auth** via `getAuthUserId(ctx)`; admin-only via `requireAdmin(ctx)` (Phase 1, `convex/users.ts`); internal/cron functions skip auth.
- **Inside actions, call `ctx.runMutation/runQuery/runAction(internal.*)`** — never `api.*`.
- **`balance` on `users` is the single source of truth.** Never compute balance by aggregation. Every change to `balance` happens in the SAME mutation that writes the matching immutable `transactions` row, with correct `balanceBefore`/`balanceAfter`.
- **`transactions` is append-only** — never patch or delete a transaction. Corrections happen via a new `reversal` row.
- **Money is integer XPF.** No floats in stored amounts. Pricing: 30 min = 250, 60 min = 500.
- **When adding a new `convex/*.ts` module**, `npx convex deploy` regenerates `convex/_generated/api.d.ts`; commit the regenerated files.
- **`"use node"` is the first line** of any Convex file using `axios`/`googleapis`/Node APIs (`legrand.ts`, the reset-email provider).

**Testing approach:** No unit-test runner (MVP, mirrors LifeLup). Per-task verification = `npm run build`, `npm run lint`, `npx convex deploy` (local instance `http://127.0.0.1:3220`), and data-level `npx convex run` checks. Re-export the CLI env each shell:
```bash
export CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3220
export CONVEX_SELF_HOSTED_ADMIN_KEY="$(docker exec convex-tennis bash /convex/generate_admin_key.sh)"
```

**EXECUTION SCOPE — local-only, Netatmo DRY-RUN (continues Phase 1's posture):**
- Convex stays bound to localhost; public deploy (DNS/nginx/certbot/PM2) remains deferred to the supervised operator pass.
- **Real Legrand/Netatmo creds + initial OAuth token + real court module IDs are NOT on this machine** (padel runs on Vercel). So `legrand.ts` runs in **DRY-RUN** when `NETATMO_CLIENT_ID` is absent: it logs the intended `setstate`/`homestatus` instead of calling `api.netatmo.com`, and returns a synthetic success. This makes the entire money/ledger/activation/turn-off flow fully testable locally. Switching to real hardware is a deferred operator action: set `NETATMO_CLIENT_ID`/`NETATMO_CLIENT_SECRET` on the instance, seed the initial refresh token via `legrand:seedLegrandToken`, and set real `courts` module IDs.
- Browser E2E for auth-gated pages is verified in the deferred public pass; per-task gates here are build + lint + `npx convex run`.

**Phase 1 facts this plan builds on:** `users{role,balance?,status?}`, `transactions`, `activations`, `legrandTokens`, `courts`, `faqEntries` tables already exist in `convex/schema.ts`. `requireAdmin(ctx)` and `getMe` are in `convex/users.ts`. A bootstrapped admin user exists. There is one admin invite token used in Phase 1.

---

### Task 1: Pricing helper + courts seed/query

**Files:**
- Create: `/home/claude/dev/tennis/convex/pricing.ts`
- Create: `/home/claude/dev/tennis/convex/courts.ts`

**Interfaces:**
- Produces:
  - `cost(durationMin: number): number` — pure helper, throws on invalid duration. Reused by activation + UI.
  - `api.courts.list()` — public query, returns active courts ordered by number.
  - `internal.courts.seedCourts()` — internalMutation, idempotently upserts courts 1/2/3.
  - `api.courts.upsert({...})` — admin mutation.

- [ ] **Step 1: Write the pricing helper (single source of truth for cost)**

`convex/pricing.ts`:
```ts
// XPF price per court session. Single source — used by activation mutation and the UI.
const PRICE = { 30: 250, 60: 500 } as const;

export function cost(durationMin: number): number {
  if (durationMin !== 30 && durationMin !== 60) {
    throw new Error("Durée invalide (30 ou 60 minutes uniquement)");
  }
  return PRICE[durationMin];
}
```

- [ ] **Step 2: Write `courts.ts`**

`convex/courts.ts`:
```ts
import { v } from "convex/values";
import { mutation, internalMutation, query } from "./_generated/server";
import { requireAdmin } from "./users";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const courts = await ctx.db.query("courts").collect();
    return courts
      .filter((c) => c.active)
      .sort((a, b) => a.courtNumber - b.courtNumber);
  },
});

// Idempotent seed of the 3 tennis courts. Module IDs are PLACEHOLDERS shared from the
// padel Netatmo home — the real tennis court module IDs must be set by an admin via
// courts.upsert (or here) once known. homeId/bridgeId default to padel's values.
export const seedCourts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const HOME = "66d96885a841f16b310e468f";
    const BRIDGE = "00:04:74:44:8e:24";
    const defaults = [
      { courtNumber: 1, label: "Court 1", moduleId: "PLACEHOLDER_COURT1" },
      { courtNumber: 2, label: "Court 2", moduleId: "PLACEHOLDER_COURT2" },
      { courtNumber: 3, label: "Court 3", moduleId: "PLACEHOLDER_COURT3" },
    ];
    for (const d of defaults) {
      const existing = await ctx.db
        .query("courts")
        .withIndex("by_court", (q) => q.eq("courtNumber", d.courtNumber))
        .first();
      if (existing) continue;
      await ctx.db.insert("courts", {
        courtNumber: d.courtNumber,
        label: d.label,
        moduleId: d.moduleId,
        bridgeId: BRIDGE,
        homeId: HOME,
        active: true,
      });
    }
  },
});

export const upsert = mutation({
  args: {
    courtNumber: v.number(),
    label: v.string(),
    moduleId: v.string(),
    bridgeId: v.string(),
    homeId: v.string(),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const existing = await ctx.db
      .query("courts")
      .withIndex("by_court", (q) => q.eq("courtNumber", args.courtNumber))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return ctx.db.insert("courts", args);
  },
});
```

- [ ] **Step 3: Deploy and verify**

```bash
cd /home/claude/dev/tennis && npx convex deploy
npx convex run courts:seedCourts '{}'
npx convex run courts:list '{}'
npm run build && npm run lint
```
Expected: `seedCourts` runs (no return); `list` returns 3 courts (numbers 1,2,3, `active:true`); build + lint clean.

- [ ] **Step 4: Commit**

```bash
git add convex/pricing.ts convex/courts.ts convex/_generated
git commit -m "feat(courts): pricing helper + courts table seed/list/upsert"
```

---

### Task 2: Credit accounts + transaction listing

**Files:**
- Create: `/home/claude/dev/tennis/convex/balance.ts`
- Create: `/home/claude/dev/tennis/convex/transactions.ts`

**Interfaces:**
- Produces:
  - `api.balance.creditAccount({ userId, amount, comment? })` — admin mutation; atomically `balance += amount` and appends a `credit` transaction with before/after. Returns `{ balanceAfter }`.
  - `api.transactions.listForUser({ userId? })` — the caller's own ledger (or, for admin, any user's), newest first.
  - `api.transactions.listAll()` — admin; all transactions newest first.

- [ ] **Step 1: Write `balance.ts` (credit only — reversal is Task 3)**

`convex/balance.ts`:
```ts
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireAdmin } from "./users";

export const creditAccount = mutation({
  args: { userId: v.id("users"), amount: v.number(), comment: v.optional(v.string()) },
  handler: async (ctx, { userId, amount, comment }) => {
    const adminId = await requireAdmin(ctx);
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error("Le montant doit être un entier positif");
    }
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("Utilisateur introuvable");

    const balanceBefore = user.balance ?? 0;
    const balanceAfter = balanceBefore + amount;
    await ctx.db.insert("transactions", {
      userId,
      type: "credit",
      amount,
      balanceBefore,
      balanceAfter,
      comment,
      authorId: adminId,
      createdAt: Date.now(),
    });
    await ctx.db.patch(userId, { balance: balanceAfter });
    return { balanceAfter };
  },
});
```

- [ ] **Step 2: Write `transactions.ts`**

`convex/transactions.ts`:
```ts
import { v } from "convex/values";
import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireAdmin } from "./users";

export const listForUser = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, { userId }) => {
    const me = await getAuthUserId(ctx);
    if (!me) throw new Error("Non authentifié");
    let target = me;
    if (userId && userId !== me) {
      await requireAdmin(ctx); // only an admin may read someone else's ledger
      target = userId;
    }
    return ctx.db
      .query("transactions")
      .withIndex("by_user", (q) => q.eq("userId", target))
      .order("desc")
      .collect();
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return ctx.db.query("transactions").order("desc").collect();
  },
});
```

- [ ] **Step 3: Deploy and verify against the bootstrapped admin user**

```bash
cd /home/claude/dev/tennis && npx convex deploy
# Find the admin user id (data browser, or a temporary listMembers via authed call).
# Quick path: query the users table id via the dashboard, then:
npx convex run balance:creditAccount '{"userId":"<adminUserId>","amount":1000,"comment":"seed test"}'
npx convex run transactions:listForUser '{"userId":"<adminUserId>"}'
npm run build && npm run lint
```
Expected: `creditAccount` returns `{ balanceAfter: 1000 }`; `listForUser` shows one `credit` transaction with `balanceBefore:0, balanceAfter:1000`; build + lint clean. (If you cannot easily get the admin id without auth, insert a throwaway `internalMutation` temporarily, or use the Convex dashboard data browser to read it.)

- [ ] **Step 4: Commit**

```bash
git add convex/balance.ts convex/transactions.ts convex/_generated
git commit -m "feat(balance): atomic creditAccount + transaction listing"
```

---

### Task 3: Reverse a transaction (cancel credit or debit)

**Files:**
- Modify: `/home/claude/dev/tennis/convex/balance.ts` (add `reverseTransaction`)

**Interfaces:**
- Produces: `api.balance.reverseTransaction({ transactionId, comment? })` — admin mutation; creates an immutable `reversal` whose amount inverts the target's net balance effect, updates `balance`, and never deletes anything. Idempotent: refuses to reverse a transaction that is already reversed or is itself a reversal.

- [ ] **Step 1: Add `reverseTransaction` to `balance.ts`**

Append to `convex/balance.ts`:
```ts
export const reverseTransaction = mutation({
  args: { transactionId: v.id("transactions"), comment: v.optional(v.string()) },
  handler: async (ctx, { transactionId, comment }) => {
    const adminId = await requireAdmin(ctx);
    const target = await ctx.db.get(transactionId);
    if (!target) throw new Error("Transaction introuvable");
    if (target.type === "reversal") throw new Error("Une annulation ne peut pas être annulée");

    // Refuse double-reversal: bail if a reversal already points at this transaction.
    const already = await ctx.db
      .query("transactions")
      .withIndex("by_user", (q) => q.eq("userId", target.userId))
      .collect();
    if (already.some((t) => t.reversalOf === transactionId)) {
      throw new Error("Transaction déjà annulée");
    }

    const user = await ctx.db.get(target.userId);
    if (!user) throw new Error("Utilisateur introuvable");
    const balanceBefore = user.balance ?? 0;

    // A credit added +amount, so its reversal subtracts amount; a debit subtracted amount,
    // so its reversal adds it back. Net effect = invert the target's sign on balance.
    const delta = target.type === "credit" ? -target.amount : target.amount;
    const balanceAfter = balanceBefore + delta;

    await ctx.db.insert("transactions", {
      userId: target.userId,
      type: "reversal",
      amount: target.amount,
      balanceBefore,
      balanceAfter,
      comment: comment ?? `Annulation de ${target.type} (${target.amount} XPF)`,
      authorId: adminId,
      reversalOf: transactionId,
      createdAt: Date.now(),
    });
    await ctx.db.patch(target.userId, { balance: balanceAfter });
    return { balanceAfter };
  },
});
```

- [ ] **Step 2: Deploy and verify the round-trip restores balance**

```bash
cd /home/claude/dev/tennis && npx convex deploy
# Using the credit transaction id from Task 2 (read it from listForUser output):
npx convex run balance:reverseTransaction '{"transactionId":"<creditTxId>"}'
npx convex run transactions:listForUser '{"userId":"<adminUserId>"}'
# Reverse again to confirm idempotency guard:
npx convex run balance:reverseTransaction '{"transactionId":"<creditTxId>"}'
npm run build && npm run lint
```
Expected: first reversal returns `{ balanceAfter: 0 }` and adds a `reversal` row with `reversalOf` set; the second call throws "Transaction déjà annulée"; build + lint clean.

- [ ] **Step 3: Commit**

```bash
git add convex/balance.ts convex/_generated
git commit -m "feat(balance): reverseTransaction — immutable inverse, double-reversal guard"
```

---

### Task 4: Legrand token management + Netatmo helpers (dry-run aware)

**Files:**
- Modify: `/home/claude/dev/tennis/package.json` (add `axios`)
- Create: `/home/claude/dev/tennis/convex/legrand.ts`

**Interfaces:**
- Produces (all internal — never client-callable):
  - `internal.legrand.seedLegrandToken({ refreshToken })` — internalMutation; inserts the initial OAuth refresh token row (operator bootstrap).
  - `internal.legrand.getValidToken()` — internalAction; returns a valid access token string, refreshing if the stored one expires within 60s. Throws a clear error if no token is seeded AND not in dry-run.
  - `internal.legrand.refreshToken()` — internalAction; forces a refresh (used by the cron in Task 6).
  - `internal.legrand.netatmoSetState({ homeId, moduleId, bridgeId, on })` — internalAction; turns a court light on/off. DRY-RUN logs + returns `"dry-run"` when `NETATMO_CLIENT_ID` is unset.
  - `internal.legrand.latestToken()` — internalQuery used by the actions to read the stored token row.

- [ ] **Step 1: Add axios**

In `package.json` dependencies add `"axios": "^1.10.0"`, then:
```bash
cd /home/claude/dev/tennis && npm install
```

- [ ] **Step 2: Write `legrand.ts`** (ports padel `TurnOnDevice.js` token + setstate logic)

`convex/legrand.ts`:
```ts
"use node";

import { v } from "convex/values";
import axios from "axios";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

const NETATMO = "https://api.netatmo.com";
const SAFETY_MARGIN_MS = 60 * 1000;
const RETRYABLE = new Set([429, 502, 503, 504]);

function dryRun() {
  return !process.env.NETATMO_CLIENT_ID;
}

export const latestToken = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("legrandTokens").collect();
    rows.sort((a, b) => b.obtainedAt - a.obtainedAt);
    return rows[0] ?? null;
  },
});

export const storeToken = internalMutation({
  args: { accessToken: v.string(), refreshToken: v.string(), expiresIn: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.insert("legrandTokens", { ...args, obtainedAt: Date.now() });
  },
});

export const seedLegrandToken = internalMutation({
  args: { refreshToken: v.string() },
  handler: async (ctx, { refreshToken }) => {
    // Seed with an expired access token so the next getValidToken forces a refresh.
    await ctx.db.insert("legrandTokens", {
      accessToken: "",
      refreshToken,
      expiresIn: 0,
      obtainedAt: 0,
    });
  },
});

export const refreshToken = internalAction({
  args: {},
  handler: async (ctx): Promise<string> => {
    if (dryRun()) {
      console.log("[legrand] DRY-RUN refreshToken");
      return "dry-run-token";
    }
    const row = await ctx.runQuery(internal.legrand.latestToken, {});
    if (!row) throw new Error("Aucun token Legrand initial — exécuter seedLegrandToken");

    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: row.refreshToken,
      client_id: process.env.NETATMO_CLIENT_ID!,
      client_secret: process.env.NETATMO_CLIENT_SECRET!,
    });
    const resp = await axios.post(`${NETATMO}/oauth2/token`, params.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 10000,
    });
    const access = resp.data.access_token as string;
    await ctx.runMutation(internal.legrand.storeToken, {
      accessToken: access,
      refreshToken: (resp.data.refresh_token as string) || row.refreshToken,
      expiresIn: resp.data.expires_in as number,
    });
    return access;
  },
});

export const getValidToken = internalAction({
  args: {},
  handler: async (ctx): Promise<string> => {
    if (dryRun()) return "dry-run-token";
    const row = await ctx.runQuery(internal.legrand.latestToken, {});
    if (!row) throw new Error("Aucun token Legrand — exécuter seedLegrandToken");
    const expiresAt = row.obtainedAt + row.expiresIn * 1000 - SAFETY_MARGIN_MS;
    if (Date.now() < expiresAt && row.accessToken) return row.accessToken;
    return ctx.runAction(internal.legrand.refreshToken, {});
  },
});

export const netatmoSetState = internalAction({
  args: { homeId: v.string(), moduleId: v.string(), bridgeId: v.string(), on: v.boolean() },
  handler: async (ctx, { homeId, moduleId, bridgeId, on }): Promise<string> => {
    if (dryRun()) {
      console.log(`[legrand] DRY-RUN setstate module=${moduleId} on=${on}`);
      return "dry-run";
    }
    const token = await ctx.runAction(internal.legrand.getValidToken, {});
    const body = { home: { id: homeId, modules: [{ id: moduleId, on, bridge: bridgeId }] } };

    let lastErr: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const resp = await axios.post(`${NETATMO}/api/setstate`, body, {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          timeout: 10000,
        });
        if (resp.data?.error || resp.data?.status !== "ok") {
          throw new Error(`Netatmo a refusé: ${JSON.stringify(resp.data)}`);
        }
        return JSON.stringify(resp.data);
      } catch (err: unknown) {
        lastErr = err;
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        const retryable =
          (status !== undefined && RETRYABLE.has(status)) ||
          (axios.isAxiosError(err) &&
            ["ECONNRESET", "ECONNABORTED", "ETIMEDOUT", "ENOTFOUND"].includes(err.code ?? ""));
        if (attempt < 2 && retryable) {
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        throw lastErr;
      }
    }
    throw lastErr;
  },
});
```

- [ ] **Step 3: Deploy and verify dry-run paths**

```bash
cd /home/claude/dev/tennis && npx convex deploy
npx convex run legrand:netatmoSetState '{"homeId":"h","moduleId":"m","bridgeId":"b","on":true}'
npx convex run legrand:getValidToken '{}'
npx convex logs --limit 10
npm run build && npm run lint
```
Expected: `netatmoSetState` returns `"dry-run"` and logs `[legrand] DRY-RUN setstate module=m on=true`; `getValidToken` returns `"dry-run-token"`; build + lint clean. (With no `NETATMO_CLIENT_ID` set, every call takes the dry-run branch — that is the intended local behavior.)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json convex/legrand.ts convex/_generated
git commit -m "feat(legrand): token refresh + Netatmo setstate (dry-run aware, ported from padel)"
```

---

### Task 5: Activation flow — reserve-first, auto-reverse on failure

**Files:**
- Create: `/home/claude/dev/tennis/convex/activations.ts`

**Interfaces:**
- Consumes: `cost` (Task 1), `internal.legrand.netatmoSetState` (Task 4), `courts` rows.
- Produces:
  - `internal.activations.beginActivation({ userId, court, durationMin })` — internalMutation: validates court + balance, debits, writes `debit` transaction + `pending` activation atomically. Returns `{ activationId, homeId, moduleId, bridgeId, amount, balanceAfter, endTime }`.
  - `internal.activations.confirmActivation({ activationId, netatmoResponse })` — flips to `active`.
  - `internal.activations.failActivation({ activationId, reason })` — flips to `failed` and appends a `reversal` restoring the balance.
  - `api.activations.activateLight({ court, durationMin })` — public action: auth → begin → setstate → confirm / (fail+reverse). Returns `{ amount, balanceAfter, endTime }`.
  - `api.activations.listMine()` / `api.activations.listAll()` — activation history (member / admin).

- [ ] **Step 1: Write `activations.ts`**

`convex/activations.ts`:
```ts
import { v } from "convex/values";
import { action, internalMutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { requireAdmin } from "./users";
import { cost } from "./pricing";

export const beginActivation = internalMutation({
  args: { userId: v.id("users"), court: v.number(), durationMin: v.number() },
  handler: async (ctx, { userId, court, durationMin }) => {
    const amount = cost(durationMin); // throws on invalid duration
    const courtRow = await ctx.db
      .query("courts")
      .withIndex("by_court", (q) => q.eq("courtNumber", court))
      .first();
    if (!courtRow || !courtRow.active) throw new Error("Court indisponible");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("Utilisateur introuvable");
    const balanceBefore = user.balance ?? 0;
    if (balanceBefore < amount) throw new Error("Solde insuffisant");
    const balanceAfter = balanceBefore - amount;

    const now = Date.now();
    const endTime = now + durationMin * 60 * 1000;
    const activationId = await ctx.db.insert("activations", {
      userId,
      court,
      durationMin,
      amount,
      status: "pending",
      startTime: now,
      endTime,
    });
    const txId = await ctx.db.insert("transactions", {
      userId,
      type: "debit",
      amount,
      balanceBefore,
      balanceAfter,
      court,
      durationMin,
      activationId,
      createdAt: now,
    });
    await ctx.db.patch(userId, { balance: balanceAfter });
    await ctx.db.patch(activationId, { transactionId: txId });

    return {
      activationId,
      homeId: courtRow.homeId,
      moduleId: courtRow.moduleId,
      bridgeId: courtRow.bridgeId,
      amount,
      balanceAfter,
      endTime,
    };
  },
});

export const confirmActivation = internalMutation({
  args: { activationId: v.id("activations"), netatmoResponse: v.string() },
  handler: async (ctx, { activationId, netatmoResponse }) => {
    await ctx.db.patch(activationId, { status: "active", netatmoResponse });
  },
});

export const failActivation = internalMutation({
  args: { activationId: v.id("activations"), reason: v.string() },
  handler: async (ctx, { activationId, reason }) => {
    const act = await ctx.db.get(activationId);
    if (!act || act.status === "failed") return;
    await ctx.db.patch(activationId, { status: "failed", netatmoResponse: reason });
    if (!act.transactionId) return;

    const user = await ctx.db.get(act.userId);
    if (!user) return;
    const balanceBefore = user.balance ?? 0;
    const balanceAfter = balanceBefore + act.amount;
    await ctx.db.insert("transactions", {
      userId: act.userId,
      type: "reversal",
      amount: act.amount,
      balanceBefore,
      balanceAfter,
      comment: `Échec allumage court ${act.court} — recrédité`,
      reversalOf: act.transactionId,
      createdAt: Date.now(),
    });
    await ctx.db.patch(act.userId, { balance: balanceAfter });
  },
});

export const activateLight = action({
  args: { court: v.number(), durationMin: v.number() },
  handler: async (ctx, { court, durationMin }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");

    // Reserve first: atomic balance check + debit + pending activation.
    const begun = await ctx.runMutation(internal.activations.beginActivation, {
      userId,
      court,
      durationMin,
    });

    try {
      const resp = await ctx.runAction(internal.legrand.netatmoSetState, {
        homeId: begun.homeId,
        moduleId: begun.moduleId,
        bridgeId: begun.bridgeId,
        on: true,
      });
      await ctx.runMutation(internal.activations.confirmActivation, {
        activationId: begun.activationId,
        netatmoResponse: resp,
      });
      return { amount: begun.amount, balanceAfter: begun.balanceAfter, endTime: begun.endTime };
    } catch (err: unknown) {
      // Hardware/API failure → reverse the debit so the member is not charged.
      await ctx.runMutation(internal.activations.failActivation, {
        activationId: begun.activationId,
        reason: err instanceof Error ? err.message : String(err),
      });
      throw new Error("Échec de l'allumage — votre compte a été recrédité.");
    }
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");
    const all = await ctx.db.query("activations").collect();
    return all
      .filter((a) => a.userId === userId)
      .sort((a, b) => b.startTime - a.startTime);
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const all = await ctx.db.query("activations").collect();
    return all.sort((a, b) => b.startTime - a.startTime);
  },
});
```

- [ ] **Step 2: Deploy and verify the full money flow (dry-run Netatmo)**

```bash
cd /home/claude/dev/tennis && npx convex deploy
# Ensure the admin user has balance (Task 2 credited 1000, Task 3 may have reversed it):
npx convex run balance:creditAccount '{"userId":"<adminUserId>","amount":1000,"comment":"activation test"}'
# activateLight is auth-gated (public action) — it cannot be called via `npx convex run`
# without an auth context. Verify the flow through its internal pieces instead:
npx convex run activations:beginActivation '{"userId":"<adminUserId>","court":1,"durationMin":30}'
# -> returns { activationId, amount:250, balanceAfter:750, ... }. Then confirm:
npx convex run activations:confirmActivation '{"activationId":"<id>","netatmoResponse":"dry-run"}'
npx convex run transactions:listForUser '{"userId":"<adminUserId>"}'
# Insufficient-balance path: try a court when balance < cost -> beginActivation throws "Solde insuffisant".
npm run build && npm run lint
```
Expected: `beginActivation` debits 250, balance 1000→750, writes a `debit` tx (court 1, durationMin 30) + a `pending` activation linked by `transactionId`; `confirmActivation` flips it `active`; `listForUser` shows the debit. `beginActivation` with an underfunded user throws "Solde insuffisant" and writes NOTHING. Build + lint clean. (The full `activateLight` action incl. auth is exercised in the deferred browser pass.)

- [ ] **Step 3: Commit**

```bash
git add convex/activations.ts convex/_generated
git commit -m "feat(activations): reserve-first activation with auto-reverse on Netatmo failure"
```

---

### Task 6: Crons — auto-turn-off due lights + proactive token refresh

**Files:**
- Create: `/home/claude/dev/tennis/convex/crons.ts`
- Modify: `/home/claude/dev/tennis/convex/activations.ts` (add `turnoffDue` internalAction + `dueActive` internalQuery + `markUsed` internalMutation)

**Interfaces:**
- Produces:
  - `internal.activations.dueActive()` — internalQuery: `active` activations whose `endTime <= now`.
  - `internal.activations.markUsed({ activationId, netatmoResponse })` — internalMutation: flips to `used`.
  - `internal.activations.turnoffDue()` — internalAction: for each due activation, call `netatmoSetState({on:false})`, then `markUsed`.
  - Crons: `turnoff-due-lights` every 1 minute; `refresh-legrand` every 30 minutes.

- [ ] **Step 1: Add the turn-off pieces to `activations.ts`**

Append to `convex/activations.ts` (add `internalAction, internalQuery` to the existing `./_generated/server` import):
```ts
export const dueActive = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const active = await ctx.db
      .query("activations")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    return active.filter((a) => a.endTime <= now);
  },
});

export const markUsed = internalMutation({
  args: { activationId: v.id("activations"), netatmoResponse: v.string() },
  handler: async (ctx, { activationId, netatmoResponse }) => {
    await ctx.db.patch(activationId, { status: "used", netatmoResponse });
  },
});

export const turnoffDue = internalAction({
  args: {},
  handler: async (ctx) => {
    const due = await ctx.runQuery(internal.activations.dueActive, {});
    for (const a of due) {
      const courtRow = await ctx.runQuery(internal.courts.byNumber, { courtNumber: a.court });
      if (!courtRow) continue;
      try {
        const resp = await ctx.runAction(internal.legrand.netatmoSetState, {
          homeId: courtRow.homeId,
          moduleId: courtRow.moduleId,
          bridgeId: courtRow.bridgeId,
          on: false,
        });
        await ctx.runMutation(internal.activations.markUsed, {
          activationId: a._id,
          netatmoResponse: resp,
        });
      } catch (err: unknown) {
        // Leave it active; the next cron tick retries. Log only.
        console.log(`[turnoff] court ${a.court} échec: ${err instanceof Error ? err.message : err}`);
      }
    }
  },
});
```

Also add to `convex/courts.ts` an internal lookup used by the cron:
```ts
import { internalQuery } from "./_generated/server";

export const byNumber = internalQuery({
  args: { courtNumber: v.number() },
  handler: async (ctx, { courtNumber }) => {
    return ctx.db
      .query("courts")
      .withIndex("by_court", (q) => q.eq("courtNumber", courtNumber))
      .first();
  },
});
```

- [ ] **Step 2: Write `crons.ts`**

`convex/crons.ts`:
```ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "turnoff-due-lights",
  { minutes: 1 },
  internal.activations.turnoffDue,
);

crons.interval(
  "refresh-legrand",
  { minutes: 30 },
  internal.legrand.refreshToken,
);

export default crons;
```

- [ ] **Step 3: Deploy and verify the turn-off logic**

```bash
cd /home/claude/dev/tennis && npx convex deploy
# Create an already-expired active activation to exercise the sweep:
#  (beginActivation sets endTime = now + duration; instead, manually drive the pieces)
npx convex run activations:beginActivation '{"userId":"<adminUserId>","court":1,"durationMin":30}'
npx convex run activations:confirmActivation '{"activationId":"<id>","netatmoResponse":"dry-run"}'
# Force it due by running turnoffDue after patching endTime into the past via the dashboard,
# OR just run turnoffDue and confirm it no-ops cleanly when nothing is due:
npx convex run activations:turnoffDue '{}'
npx convex logs --limit 10
npm run build && npm run lint
```
Expected: `npx convex deploy` registers both crons (visible in the deploy output / dashboard "Schedules"). `turnoffDue` runs without error; when an activation is genuinely past `endTime` it flips to `used` (dry-run logs the off-setstate). Build + lint clean.

- [ ] **Step 4: Commit**

```bash
git add convex/crons.ts convex/activations.ts convex/courts.ts convex/_generated
git commit -m "feat(crons): auto-turn-off due lights (1m) + proactive Legrand token refresh (30m)"
```

---

### Task 7: Member activation page (6 buttons)

**Files:**
- Create: `/home/claude/dev/tennis/app/activate/page.tsx`
- Create: `/home/claude/dev/tennis/components/ActivatePanel.tsx`

**Interfaces:**
- Consumes: `api.courts.list`, `api.users.getMe`, `api.activations.activateLight` (action), `cost` is mirrored client-side via the prices map.

- [ ] **Step 1: Write the activation panel**

`components/ActivatePanel.tsx`:
```tsx
"use client";

import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";

const PRICES: Record<number, number> = { 30: 250, 60: 500 };

export function ActivatePanel() {
  const me = useQuery(api.users.getMe);
  const courts = useQuery(api.courts.list);
  const activate = useAction(api.activations.activateLight);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (me === undefined || courts === undefined) {
    return <p>Chargement…</p>;
  }

  async function run(court: number, durationMin: number) {
    const key = `${court}-${durationMin}`;
    setBusy(key);
    setMessage(null);
    try {
      const res = await activate({ court, durationMin });
      setMessage({ ok: true, text: `Lumière allumée — ${res.amount} XPF débités, solde ${res.balanceAfter} XPF.` });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Erreur" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-lg font-medium">Solde : {me?.balance ?? 0} XPF</p>
      <div className="grid gap-4">
        {courts.map((c) => (
          <div key={c._id} className="rounded-lg border border-gray-200 p-4">
            <h2 className="mb-3 font-semibold">{c.label}</h2>
            <div className="flex gap-3">
              {[30, 60].map((d) => (
                <button
                  key={d}
                  disabled={busy !== null}
                  onClick={() => run(c.courtNumber, d)}
                  className="flex-1 rounded bg-blue-600 px-4 py-3 text-white disabled:opacity-50"
                >
                  {busy === `${c.courtNumber}-${d}` ? "…" : `${d === 30 ? "30 min" : "1 h"} · ${PRICES[d]} XPF`}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {message && (
        <p className={message.ok ? "text-green-600" : "text-red-600"}>{message.text}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write the protected page**

`app/activate/page.tsx`:
```tsx
"use client";

import { AuthGate } from "@/components/AuthGate";
import { ActivatePanel } from "@/components/ActivatePanel";
import { SignOutButton } from "@/components/SignOutButton";

export default function ActivatePage() {
  return (
    <AuthGate>
      <main className="mx-auto max-w-2xl p-6">
        <header className="mb-8 flex items-center justify-between">
          <h1 className="text-xl font-bold">Activer une lumière</h1>
          <SignOutButton />
        </header>
        <ActivatePanel />
      </main>
    </AuthGate>
  );
}
```

- [ ] **Step 3: Verify (build/lint; browser deferred)**

```bash
cd /home/claude/dev/tennis && npm run build && npm run lint
```
Expected: route `/activate` present; build + lint clean. (Clicking buttons is exercised in the deferred browser pass; in dry-run, a click would debit + log the setstate + return success.)

- [ ] **Step 4: Commit**

```bash
git add app/activate components/ActivatePanel.tsx
git commit -m "feat(ui): member activation page — 3 courts x 30min/1h"
```

---

### Task 8: Admin credits + history pages

**Files:**
- Create: `/home/claude/dev/tennis/app/credits/page.tsx`
- Create: `/home/claude/dev/tennis/components/CreditsPanel.tsx`
- Create: `/home/claude/dev/tennis/app/history/page.tsx`
- Create: `/home/claude/dev/tennis/components/HistoryPanel.tsx`
- Modify: `/home/claude/dev/tennis/convex/users.ts` (add `requireAdminQuery`-safe `searchMembers` if needed — see Step 1)

**Interfaces:**
- Consumes: `api.users.listMembers`, `api.balance.creditAccount`, `api.balance.reverseTransaction`, `api.transactions.listAll`, `api.activations.listAll`.

- [ ] **Step 1: Admin credits panel** (credit + reverse, with a member picker)

`components/CreditsPanel.tsx`:
```tsx
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
```

- [ ] **Step 2: History panel** (transactions + activations, with a text filter)

`components/HistoryPanel.tsx`:
```tsx
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
```

- [ ] **Step 3: Admin pages wrapping the panels**

`app/credits/page.tsx`:
```tsx
"use client";

import { AuthGate } from "@/components/AuthGate";
import { CreditsPanel } from "@/components/CreditsPanel";
import { SignOutButton } from "@/components/SignOutButton";

export default function CreditsPage() {
  return (
    <AuthGate>
      <main className="mx-auto max-w-2xl p-6">
        <header className="mb-8 flex items-center justify-between">
          <h1 className="text-xl font-bold">Créditer un compte</h1>
          <SignOutButton />
        </header>
        <CreditsPanel />
      </main>
    </AuthGate>
  );
}
```

`app/history/page.tsx`:
```tsx
"use client";

import { AuthGate } from "@/components/AuthGate";
import { HistoryPanel } from "@/components/HistoryPanel";
import { SignOutButton } from "@/components/SignOutButton";

export default function HistoryPage() {
  return (
    <AuthGate>
      <main className="mx-auto max-w-4xl p-6">
        <header className="mb-8 flex items-center justify-between">
          <h1 className="text-xl font-bold">Historique des transactions</h1>
          <SignOutButton />
        </header>
        <HistoryPanel />
      </main>
    </AuthGate>
  );
}
```

> Note: `listMembers`, `listAll`, `creditAccount`, `reverseTransaction` all enforce `requireAdmin` server-side, so a non-admin who reaches these pages sees a thrown error from the query rather than data. (Admin-only nav hiding + a dedicated admin layout guard is a Phase 3 polish item.)

- [ ] **Step 4: Verify**

```bash
cd /home/claude/dev/tennis && npm run build && npm run lint
```
Expected: routes `/credits` and `/history` present; build + lint clean.

- [ ] **Step 5: Commit**

```bash
git add app/credits app/history components/CreditsPanel.tsx components/HistoryPanel.tsx
git commit -m "feat(ui): admin credit panel + transaction history with reversal & search"
```

---

### Task 9: Forgot-password / reset flow (Phase 1 deferral, Gmail-backed)

**Files:**
- Create: `/home/claude/dev/tennis/convex/ResetEmail.ts` (custom reset email provider, `"use node"`)
- Modify: `/home/claude/dev/tennis/convex/auth.ts` (wire `Password({ reset: ResetEmail })`)
- Create: `/home/claude/dev/tennis/app/forgot-password/page.tsx`
- Create: `/home/claude/dev/tennis/components/ForgotPasswordForm.tsx`

**Interfaces:**
- Produces: the Convex Auth `reset` + `reset-verification` flow, sending the code via the existing Gmail action infra. `app/forgot-password` collects email → sends code; same page then accepts code + new password.

- [ ] **Step 1: Custom reset email provider** (sends the reset code via Gmail; dry-run logs when no creds)

`convex/ResetEmail.ts`:
```ts
"use node";

import { Email } from "@convex-dev/auth/providers/Email";
import { google } from "googleapis";

function buildRaw(from: string, to: string, subject: string, html: string) {
  const lines = [
    'Content-Type: text/html; charset="UTF-8"',
    "MIME-Version: 1.0",
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "",
    html,
  ];
  return Buffer.from(lines.join("\n")).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Convex Auth Email provider: generates a code and calls sendVerificationRequest.
export const ResetEmail = Email({
  id: "reset-email",
  maxAge: 60 * 15, // code valid 15 min
  async sendVerificationRequest({ identifier: email, token }) {
    const from = process.env.GMAIL_FROM ?? "Dragon Tennis <padel.asdragon@gmail.com>";
    const html = `<p>Votre code de réinitialisation Dragon Tennis : <strong>${token}</strong></p>
<p>Il expire dans 15 minutes.</p>`;
    if (!process.env.GOOGLE_CLIENT_ID) {
      console.log(`[reset] (no Gmail creds) code pour ${email}: ${token}`);
      return;
    }
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      "http://localhost:3000",
    );
    oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const { credentials } = await oauth2.refreshAccessToken();
    oauth2.setCredentials(credentials);
    const gmail = google.gmail({ version: "v1", auth: oauth2 });
    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: buildRaw(from, email, "Réinitialisation — Dragon Tennis", html) },
    });
  },
});
```

- [ ] **Step 2: Wire the reset provider into `auth.ts`**

In `convex/auth.ts`, import and pass `reset` to the Password provider (keep the existing `createOrUpdateUser` callback unchanged):
```ts
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ResetEmail } from "./ResetEmail";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password({ reset: ResetEmail })],
  callbacks: {
    /* ...unchanged createOrUpdateUser invite gate... */
  },
});
```

- [ ] **Step 3: Forgot-password form (two steps on one page)**

`components/ForgotPasswordForm.tsx`:
```tsx
"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function ForgotPasswordForm() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [step, setStep] = useState<"request" | "verify">("request");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (step === "request") {
    return (
      <form
        className="flex w-full max-w-sm flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            await signIn("password", { email, flow: "reset" });
            setStep("verify");
          } catch {
            setError("Impossible d'envoyer le code.");
          }
        }}
      >
        <input
          type="email" required value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email" className="rounded border border-gray-300 px-3 py-2"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="rounded bg-blue-600 px-4 py-2 text-white">Envoyer le code</button>
      </form>
    );
  }

  return (
    <form
      className="flex w-full max-w-sm flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const fd = new FormData(e.currentTarget);
        try {
          await signIn("password", {
            email,
            code: String(fd.get("code")),
            newPassword: String(fd.get("newPassword")),
            flow: "reset-verification",
          });
          router.push("/");
        } catch {
          setError("Code invalide ou expiré.");
        }
      }}
    >
      <input name="code" required placeholder="Code reçu par email"
        className="rounded border border-gray-300 px-3 py-2" />
      <input name="newPassword" type="password" required minLength={8}
        placeholder="Nouveau mot de passe" className="rounded border border-gray-300 px-3 py-2" />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="rounded bg-blue-600 px-4 py-2 text-white">Réinitialiser</button>
    </form>
  );
}
```

`app/forgot-password/page.tsx`:
```tsx
import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <h1 className="text-2xl font-bold">Mot de passe oublié</h1>
      <ForgotPasswordForm />
    </main>
  );
}
```

- [ ] **Step 4: Deploy and verify**

```bash
cd /home/claude/dev/tennis && npx convex deploy
npm run build && npm run lint
```
Expected: deploy succeeds (the `reset-email` provider registers). Build shows `/forgot-password`; lint clean. The actual reset email send is dry-run-logged locally (no Gmail creds) and verified for real in the deferred public pass. The `/forgot-password` link in `SignInForm` (Phase 1) now resolves instead of 404ing.

- [ ] **Step 5: Commit**

```bash
git add convex/ResetEmail.ts convex/auth.ts app/forgot-password components/ForgotPasswordForm.tsx convex/_generated
git commit -m "feat(auth): forgot-password / reset flow via Gmail-backed code (closes Phase 1 deferral)"
```

---

## Self-Review

**1. Spec coverage (Phase 2 slice):**
- §5 tables `transactions`/`activations`/`legrandTokens`/`courts` → used by Tasks 1–6 (defined in Phase 1). ✓
- §6 modules `balance.ts`/`activations.ts`/`legrand.ts`/`transactions.ts`/`courts.ts`/`crons.ts` → Tasks 1–6. ✓
- §7 activation flow (balance check → token → setstate → atomic debit+ledger+activation; cron turn-off) → Task 5 (improved to reserve-first/auto-reverse, documented) + Task 6. ✓
- §8 annulation (admin inverse, no physical delete, covers credit & debit) → Task 3. ✓
- Pricing 250/500, 3 courts, 6 buttons → Tasks 1 + 7. ✓
- Crédit (ajouter/corriger/annuler) → Tasks 2 + 3 + 8. ✓
- Historique transactions + activations + recherche → Tasks 2, 5, 8. ✓
- Token refresh via Convex cron (no n8n) + lazy refresh → Tasks 4 + 6. ✓
- forgot-password (Phase 1 deferral) → Task 9. ✓
- Dashboards (admin stats: CA, crédits distribués, users actifs) and member dashboard, FAQ → **Phase 3** (intentionally out of Phase 2). Member sees balance + history via `/activate` and home; full dashboards deferred.

**2. Placeholder scan:** No "TBD"/"implement later". Operator-supplied values are clearly marked: `<adminUserId>`/`<id>`/`<creditTxId>` (runtime ids the executor reads from prior output), and the `PLACEHOLDER_COURTx` module IDs + Netatmo creds + initial token are explicitly deferred operator actions, not code gaps.

**3. Type consistency:** `cost()` (pricing.ts) used by `beginActivation` and mirrored in `ActivatePanel`'s `PRICES` (same 30→250/60→500). `transactions` rows always carry `balanceBefore`/`balanceAfter`; `reverseTransaction`, `creditAccount`, `beginActivation`, `failActivation` all follow the "patch balance + insert tx in one mutation" invariant. `beginActivation` returns `{activationId,homeId,moduleId,bridgeId,amount,balanceAfter,endTime}` — consumed exactly by `activateLight`. `netatmoSetState` args `{homeId,moduleId,bridgeId,on}` match both `activateLight` and `turnoffDue` call sites. Court lookup index `by_court` used consistently.

**Carry-over from Phase 1 final review (must hold in Phase 2):**
- Phase 2 read sites guard optional `balance` with `?? 0` (done in every handler above). ✓
- Member listing for pending invitees (union users + unused invites) belongs to Phase 3's member dashboard — not needed here.

**Deferred operator actions (unchanged + new):** DNS + public deploy; Gmail creds (real invite + reset email); **new:** `NETATMO_CLIENT_ID`/`NETATMO_CLIENT_SECRET` + `legrand:seedLegrandToken` + real `courts` module IDs to leave Netatmo dry-run.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-16-tennis-phase2-balance-activation.md`. Execute with superpowers:subagent-driven-development on a fresh `phase2-balance-activation` branch (branched from `master`). Phase 3 (admin stats dashboards, member dashboard, FAQ admin CRUD) gets its own plan after Phase 2 lands.
