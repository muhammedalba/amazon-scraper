import fs from "fs";
import path from "path";
import crypto from "crypto";

function loadGoogleCreds() {
  const envVal =
    process.env.ENVIRONMENT === "production"
      ? process.env.GOOGLE_CREDS_JSON
      : process.env.GOOGLE_CREDS_JSON_PATH;
  if (envVal) {
    // If it looks like JSON, parse it
    try {
      const trimmed = envVal.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        return JSON.parse(envVal);
      }
    } catch (e) {
      // fallthrough to try as path
    }

    // If env value points to a file path, try reading it
    try {
      const possiblePath = path.resolve(process.cwd(), envVal);
      if (fs.existsSync(possiblePath)) {
        return JSON.parse(fs.readFileSync(possiblePath, "utf8"));
      }
    } catch (e) {
      throw new Error(
        "Invalid JSON in GOOGLE_CREDS_JSON environment variable or file path."
      );
    }
  }

  // fallback to credentials.json in repo root
  const credPath = path.resolve(process.cwd(), "credentials.json");
  if (fs.existsSync(credPath)) {
    try {
      return JSON.parse(fs.readFileSync(credPath, "utf8"));
    } catch (e) {
      throw new Error(`Failed to parse ${credPath}: ${e.message}`);
    }
  }

  throw new Error(
    "Google credentials not found. Set GOOGLE_CREDS_JSON (JSON or path) or place credentials.json in project root."
  );
}

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function getAccessTokenFromServiceAccount(creds) {
  const header = { alg: "RS256", typ: "JWT" };
  const iat = Math.floor(Date.now() / 1e3);
  const exp = iat + 3600;
  const payload = {
    iss: creds.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp,
    iat,
  };

  const unsigned = `${base64UrlEncode(
    JSON.stringify(header)
  )}.${base64UrlEncode(JSON.stringify(payload))}`;

  const sign = crypto.createSign("RSA-SHA256");
  const key = creds.private_key.replace(/\\n/g, "\n");
  sign.update(unsigned);
  const signature = sign.sign(key, "base64");
  const jwt = `${unsigned}.${signature
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")}`;

  const params = new URLSearchParams();
  params.append("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
  params.append("assertion", jwt);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to obtain access token: ${res.status} ${txt}`);
  }

  const data = await res.json();
  return data.access_token;
}

async function getFirstSheetTitle(spreadsheetId, token) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(title))`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(
      `Failed to read spreadsheet metadata: ${res.status} ${txt}`
    );
  }
  const data = await res.json();
  const title = data.sheets?.[0]?.properties?.title;
  if (!title) throw new Error("Could not determine sheet title.");
  return title;
}

export async function saveDealsToSheet(deals) {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId)
    throw new Error("Missing SPREADSHEET_ID environment variable.");

  const creds = loadGoogleCreds();
  const token = await getAccessTokenFromServiceAccount(creds);
  const sheetTitle = await getFirstSheetTitle(spreadsheetId, token);

  // Sheet columns: id, title, price, old_price, discount, link, posted, image_url, source
  const values = deals.map((d) => [
    // "",  id (leave blank for auto/id handled in sheet)
    d.title || "",
    d.price || "",
    d.old_price || "",
    d.discount || "",
    d.link || "",
    d.posted || "no", // posted
    d.image || "",
    d.source || "",
  ]);

  const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
    sheetTitle
  )}:append?valueInputOption=USER_ENTERED`;

  const res = await fetch(appendUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to append rows: ${res.status} ${txt}`);
  }
}
