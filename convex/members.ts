import { v } from "convex/values";
import { mutation, internalMutation, query, MutationCtx } from "./_generated/server";
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
