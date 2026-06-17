"use node";

import { v } from "convex/values";
import { google } from "googleapis";
import { internalAction } from "./_generated/server";

function buildRawMessage(from: string, to: string, subject: string, html: string) {
  const lines = [
    'Content-Type: text/html; charset="UTF-8"',
    "MIME-Version: 1.0",
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "",
    html,
  ];
  return Buffer.from(lines.join("\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export const sendInvite = internalAction({
  args: { email: v.string(), token: v.string() },
  handler: async (_ctx, { email, token }) => {
    const appUrl = process.env.APP_URL ?? "http://localhost:3001";
    const link = `${appUrl}/accept-invite/${token}`;
    const from = process.env.GMAIL_FROM ?? "Dragon Tennis <padel.asdragon@gmail.com>";

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      // Fallback: no OAuth configured — log the link so the flow stays testable.
      console.log(`[invite] (no Gmail creds) lien pour ${email}: ${link}`);
      return;
    }

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      process.env.GOOGLE_CLIENT_SECRET,
      "http://localhost:3000",
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const { credentials } = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(credentials);

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const html = `<p>Bonjour,</p>
<p>Vous avez été invité à rejoindre l'application Dragon Tennis.</p>
<p><a href="${link}">Cliquez ici pour définir votre mot de passe</a> (lien valable 7 jours).</p>`;

    const result = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: buildRawMessage(from, email, "Votre invitation — Dragon Tennis", html) },
    });
    console.log(`[invite] email envoyé à ${email} (id ${result.data.id})`);
  },
});

// Why: sendVerificationRequest in ResetEmail.ts runs in Convex V8 runtime (imported by auth.ts),
// so googleapis (Node.js built-ins) cannot be used there. This action runs in the Node.js
// runtime ("use node") and is called via ctx.runAction from the V8-safe ResetEmail provider.
export const sendResetCode = internalAction({
  args: { email: v.string(), token: v.string() },
  handler: async (_ctx, { email, token }) => {
    const from = process.env.GMAIL_FROM ?? "Dragon Tennis <padel.asdragon@gmail.com>";
    const html = `<p>Votre code de réinitialisation Dragon Tennis : <strong>${token}</strong></p>
<p>Il expire dans 15 minutes.</p>`;

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      console.log(`[reset] (no Gmail creds) code pour ${email}: ${token}`);
      return;
    }

    const oauth2 = new google.auth.OAuth2(
      clientId,
      process.env.GOOGLE_CLIENT_SECRET,
      "http://localhost:3000",
    );
    oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const { credentials } = await oauth2.refreshAccessToken();
    oauth2.setCredentials(credentials);
    const gmail = google.gmail({ version: "v1", auth: oauth2 });

    function buildRaw(from: string, to: string, subject: string, html: string) {
      const lines = [
        'Content-Type: text/html; charset="UTF-8"',
        "MIME-Version: 1.0",
        `From: ${from}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        "",
        html,
      ];
      return Buffer.from(lines.join("\n"))
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    }

    const result = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: buildRaw(from, email, "Réinitialisation — Dragon Tennis", html) },
    });
    console.log(`[reset] email envoyé à ${email} (id ${result.data.id})`);
  },
});
