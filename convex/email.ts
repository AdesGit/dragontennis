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
