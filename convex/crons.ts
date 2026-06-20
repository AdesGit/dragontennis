import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "turnoff-due-lights",
  { minutes: 1 },
  internal.activations.turnoffDue,
);

// Token Netatmo valable 3h → refresh toutes les 2h (marge ~1h avant expiration).
crons.interval(
  "refresh-legrand",
  { hours: 2 },
  internal.legrand.refreshToken,
);

crons.interval(
  "reap-stuck-pending",
  { minutes: 5 },
  internal.activations.reapStuck,
);

export default crons;
