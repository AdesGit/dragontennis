import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import type { MutationCtx } from "./_generated/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
  callbacks: {
    // Invite-only: a NEW account is created only if an unused, unexpired invite
    // exists for the email. Public signup is therefore impossible. The invite's
    // role/name are stamped onto the user, balance starts at 0, status active.
    async createOrUpdateUser(ctx, args) {
      if (args.existingUserId) {
        return args.existingUserId; // normal sign-in of an existing user
      }
      const email = (args.profile.email as string | undefined)?.toLowerCase();
      if (!email) throw new Error("Email requis");

      // Why: createOrUpdateUser receives GenericMutationCtx<AnyDataModel> which
      // lacks user-defined index types. Cast to full MutationCtx for type safety.
      const db = (ctx as unknown as MutationCtx).db;
      const invite = await db
        .query("invites")
        .withIndex("by_email", (q) => q.eq("email", email))
        .filter((q) => q.eq(q.field("used"), false))
        .first();

      if (!invite) throw new Error("Inscription sur invitation uniquement");
      if (invite.expiresAt < Date.now()) throw new Error("Invitation expirée");

      const userId = await db.insert("users", {
        email,
        firstName: invite.firstName,
        lastName: invite.lastName,
        role: invite.role,
        balance: 0,
        status: "active",
        createdAt: Date.now(),
      });
      await db.patch(invite._id, { used: true });
      return userId;
    },
  },
});
