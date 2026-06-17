const authConfig = {
  providers: [
    {
      // CONVEX_SITE_URL is empty string ("") during CLI deploy — use || not ??.
      domain: process.env.CONVEX_SITE_URL || "https://convex-tennis.aidigitalassistant.cloud",
      applicationID: "convex",
    },
  ],
};

export default authConfig;
