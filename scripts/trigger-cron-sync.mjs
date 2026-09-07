#!/usr/bin/env node
/**
 * Gọi thủ công endpoint cron sync tồn kho trên Production.
 * Usage: node scripts/trigger-cron-sync.mjs
 */
const BASE = process.env.CRON_URL || "https://sapo-webhook-app.vercel.app";
const SECRET =
  process.env.CRON_SECRET ||
  process.env.SAPO_WEBHOOK_SECRET ||
  "";

if (!SECRET) {
  console.error("Thiếu CRON_SECRET hoặc SAPO_WEBHOOK_SECRET trong env");
  process.exit(1);
}

const url = `${BASE}/api/cron/sync-inventory?secret=${encodeURIComponent(SECRET)}`;

const res = await fetch(url, { method: "GET" });
const body = await res.text();

console.log(`HTTP ${res.status}`);
try {
  console.log(JSON.stringify(JSON.parse(body), null, 2));
} catch {
  console.log(body);
}

process.exit(res.ok ? 0 : 1);
