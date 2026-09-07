#!/usr/bin/env node
/**
 * Đăng ký webhook inventory trên Sapo Omni.
 * Usage: node scripts/register-omni-webhook.mjs
 */
import fs from "fs";
import path from "path";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(envPath, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1)];
      }),
  );
}

const env = loadEnvLocal();
const BASE = (env.SAPO_OMNI_STORE_URL || env.SAPO_STORE_URL || "").replace(/\/+$/, "");
const KEY = env.SAPO_OMNI_API_KEY || env.SAPO_API_KEY;
const SECRET = env.SAPO_OMNI_API_SECRET || env.SAPO_API_SECRET;
const WEBHOOK_URL =
  process.env.WEBHOOK_URL ||
  "https://sapo-webhook-app.vercel.app/api/webhooks/sapo-inventory";

const OMNI_TOPICS = [
  "inventory_levels/update",
  "inventory_items/update",
  "receive_inventories/update",
];

const auth = Buffer.from(`${KEY}:${SECRET}`).toString("base64");

async function api(method, apiPath, body) {
  const res = await fetch(`${BASE}${apiPath}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

console.log("Sapo Omni URL:", BASE);
console.log("Webhook URL:", WEBHOOK_URL);

const existing = await api("GET", "/admin/webhooks.json");
console.log("\nGET /admin/webhooks.json → HTTP", existing.status);
const webhooks = existing.body.webhooks || [];

for (const topic of OMNI_TOPICS) {
  const found = webhooks.find(
    (w) => w.topic === topic && w.address === WEBHOOK_URL,
  );
  if (found) {
    console.log(`\n[OK] ${topic} đã tồn tại (id: ${found.id})`);
    continue;
  }

  console.log(`\n[REGISTER] ${topic}`);
  const result = await api("POST", "/admin/webhooks.json", {
    webhook: { topic, address: WEBHOOK_URL, format: "json" },
  });
  console.log("HTTP", result.status);
  console.log(JSON.stringify(result.body, null, 2));
}
