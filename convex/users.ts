import { getAuthUserId } from "@convex-dev/auth/server";
import { query, QueryCtx, MutationCtx } from "./_generated/server";

export const getMe = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return ctx.db.get(userId);
  },
});

export async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Non authentifié");
  const me = await ctx.db.get(userId);
  if (!me || me.role !== "admin") throw new Error("Accès réservé à l'administrateur");
  return userId;
}

export const listMembers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return ctx.db.query("users").collect();
  },
});
