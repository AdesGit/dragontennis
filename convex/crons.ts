import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "turnoff-due-lights",
  { minutes: 1 },
  internal.activations.turnoffDue,
);

crons.interval(
  "refresh-legrand",
  { minutes: 30 },
  internal.legrand.refreshToken,
);

crons.interval(
  "reap-stuck-pending",
  { minutes: 5 },
  internal.activations.reapStuck,
);

export default crons;
