import { v } from "convex/values";
import { mutation, internalMutation, query, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAdmin } from "./users";

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

function newToken() {
  // 32 hex chars, sufficient for an invite link
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function insertInvite(
  ctx: MutationCtx,
  args: { firstName: string; lastName: string; email: string; role: "admin" | "user" },
) {
  // Normalize on insert so the lowercased lookup in auth.ts's createOrUpdateUser matches (review I-1).
  const email = args.email.toLowerCase();

  const existingUser = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .first();
  if (existingUser) throw new Error("Un compte existe déjà pour cet email");

  // Supersede any prior unused invites for this email so a stale/expired one can't shadow
  // the fresh invite via the callback's .first() lookup (review I-2).
  const priorInvites = await ctx.db
    .query("invites")
    .withIndex("by_email", (q) => q.eq("email", email))
    .collect();
  for (const prior of priorInvites) {
    if (!prior.used) await ctx.db.patch(prior._id, { used: true });
  }

  const token = newToken();
  await ctx.db.insert("invites", {
    email,
    token,
    role: args.role,
    firstName: args.firstName,
    lastName: args.lastName,
    expiresAt: Date.now() + SEVEN_DAYS,
    used: false,
  });
  return token;
}

export const createMember = mutation({
  args: { firstName: v.string(), lastName: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const token = await insertInvite(ctx, { ...args, role: "user" });
    await ctx.scheduler.runAfter(0, internal.email.sendInvite, {
      email: args.email.toLowerCase(),
      token,
    });
    return { token };
  },
});

// Bootstrap the very first admin (no admin exists yet). Run via `npx convex run`.
export const seedAdminInvite = internalMutation({
  args: { firstName: v.string(), lastName: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    const token = await insertInvite(ctx, { ...args, role: "admin" });
    return { token };
  },
});

// Promote a member to admin (or revert to user). Guards against removing the last admin
// so the club can never lock itself out of the admin area.
export const setMemberRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("user")),
  },
  handler: async (ctx, { userId, role }) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("Membre introuvable");
    if (role === "user" && user.role === "admin") {
      const admins = (await ctx.db.query("users").collect()).filter((u) => u.role === "admin");
      if (admins.length <= 1) throw new Error("Impossible de retirer le dernier administrateur");
    }
    await ctx.db.patch(userId, { role });
  },
});

// Permanently delete a member and every row that references it (ledger, activations,
// auth account/sessions/refresh tokens, invites). Admins cannot delete themselves nor
// the last remaining admin.
export const deleteMember = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const adminId = await requireAdmin(ctx);
    if (userId === adminId) throw new Error("Vous ne pouvez pas supprimer votre propre compte");
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("Membre introuvable");
    if (user.role === "admin") {
      const admins = (await ctx.db.query("users").collect()).filter((u) => u.role === "admin");
      if (admins.length <= 1) throw new Error("Impossible de supprimer le dernier administrateur");
    }

    const txns = await ctx.db
      .query("transactions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const t of txns) await ctx.db.delete(t._id);

    const acts = await ctx.db
      .query("activations")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const a of acts) await ctx.db.delete(a._id);

    const accounts = await ctx.db.query("authAccounts").collect();
    for (const acc of accounts) {
      if (acc.userId === userId) await ctx.db.delete(acc._id);
    }

    const sessions = await ctx.db.query("authSessions").collect();
    const sessionIds = new Set<string>();
    for (const s of sessions) {
      if (s.userId === userId) sessionIds.add(s._id);
    }
    const tokens = await ctx.db.query("authRefreshTokens").collect();
    for (const tk of tokens) {
      if (sessionIds.has(tk.sessionId)) await ctx.db.delete(tk._id);
    }
    for (const s of sessions) {
      if (s.userId === userId) await ctx.db.delete(s._id);
    }

    if (user.email) {
      const invs = await ctx.db
        .query("invites")
        .withIndex("by_email", (q) => q.eq("email", user.email!))
        .collect();
      for (const i of invs) await ctx.db.delete(i._id);
    }

    await ctx.db.delete(userId);
  },
});

export const getInviteByToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (!invite || invite.used || invite.expiresAt < Date.now()) return null;
    return { email: invite.email, firstName: invite.firstName, lastName: invite.lastName };
  },
});
