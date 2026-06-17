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
