import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery, query } from "./_generated/server";
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
    // Why: only reverse a pending activation — refunding active/used (already-served) sessions would be a money leak.
    if (!act || act.status !== "pending") return;
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
  handler: async (ctx, { court, durationMin }): Promise<{ amount: number; balanceAfter: number; endTime: number }> => {
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
    const mine = await ctx.db
      .query("activations")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return mine.sort((a, b) => b.startTime - a.startTime);
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
      if (!courtRow) {
        console.warn(`[turnoff] court ${a.court} introuvable — activation ${a._id} laissée active`);
        continue;
      }
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
