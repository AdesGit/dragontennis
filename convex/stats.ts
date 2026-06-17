import { query } from "./_generated/server";
import { requireAdmin } from "./users";

export const adminDashboard = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const txns = await ctx.db.query("transactions").collect();
    const activations = await ctx.db.query("activations").collect();
    const users = await ctx.db.query("users").collect();

    // Revenue = net amount actually paid for light usage. A debit is revenue; its reversal
    // (reversalOf set, on a debit) cancels it. Simplest correct net: sum debits, subtract
    // reversals that point at a debit.
    const debitById = new Map(
      txns.filter((t) => t.type === "debit").map((t) => [t._id, t]),
    );
    let revenue = 0;
    for (const t of txns) {
      if (t.type === "debit") revenue += t.amount;
      else if (t.type === "reversal" && t.reversalOf && debitById.has(t.reversalOf)) {
        revenue -= t.amount;
      }
    }

    // Credits distributed = sum of credit txns minus reversals pointing at a credit.
    const creditById = new Map(
      txns.filter((t) => t.type === "credit").map((t) => [t._id, t]),
    );
    let creditsDistributed = 0;
    for (const t of txns) {
      if (t.type === "credit") creditsDistributed += t.amount;
      else if (t.type === "reversal" && t.reversalOf && creditById.has(t.reversalOf)) {
        creditsDistributed -= t.amount;
      }
    }

    const activationsCount = activations.filter(
      (a) => a.status === "active" || a.status === "used",
    ).length;
    const failedCount = activations.filter((a) => a.status === "failed").length;

    // Active users = users who have at least one successful activation.
    const userIdsWithActivation = new Set(
      activations
        .filter((a) => a.status === "active" || a.status === "used")
        .map((a) => a.userId),
    );
    const activeUsers = userIdsWithActivation.size;

    return {
      activationsCount,
      failedCount,
      revenue,
      creditsDistributed,
      activeUsers,
      totalMembers: users.length,
    };
  },
});
