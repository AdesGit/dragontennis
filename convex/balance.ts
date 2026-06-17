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
