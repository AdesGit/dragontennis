// Generates the RS256 keypair Convex Auth needs for self-hosted JWT signing.
// JWT_PRIVATE_KEY must be single-line (newlines -> spaces); JWKS is the public set.
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";

const keys = await generateKeyPair("RS256", { extractable: true });
const privateKey = await exportPKCS8(keys.privateKey);
const publicKey = await exportJWK(keys.publicKey);
const jwks = JSON.stringify({ keys: [{ use: "sig", ...publicKey }] });

console.log("JWT_PRIVATE_KEY=" + privateKey.trimEnd().replace(/\n/g, " "));
console.log("JWKS=" + jwks);
