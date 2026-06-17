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
