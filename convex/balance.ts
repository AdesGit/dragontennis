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
