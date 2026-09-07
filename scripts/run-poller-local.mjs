#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const env = Object.fromEntries(
  readFileSync(resolve(root, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const BASE = env.SAPO_WEB_STORE_URL.replace(/\/+$/, "");
const AUTH = Buffer.from(`${env.SAPO_WEB_API_KEY}:${env.SAPO_WEB_API_SECRET}`).toString("base64");
const LOCATION_ID = Number(env.SAPO_WEB_LOCATION_ID);
const WATCH = (env.WATCH_PHOI_SKUS || "dtbvc-T-12p,vmln-C-1").split(",").map((s) => s.trim());

async function sapo(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Basic ${AUTH}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function run() {
  const details = [];
  let scanned = 0;
  let synced = 0;

  for (const phoiSku of WATCH) {
    const data = await sapo(`/admin/variants.json?query=${encodeURIComponent(phoiSku)}&limit=10`);
    const phoi = (data.variants || []).find((v) => v.sku?.trim() === phoiSku);
    if (!phoi) {
      details.push({ phoiSku, phoiAvailable: null, targetQuantity: 0, updated: 0, retailSkus: [] });
      continue;
    }

    scanned += 1;
    const available = Number(phoi.inventory_quantity ?? 0);
    const target = Math.max(0, Math.floor(Number(phoi.inventory_quantity ?? 0)));
    const retailData = await sapo(`/admin/variants.json?query=${encodeURIComponent(phoiSku)}&limit=250`);
    const retail = (retailData.variants || []).filter(
      (v) => v.sku?.endsWith(`_${phoiSku}`) && v.sku !== phoiSku,
    );

    const retailSkus = [];
    for (const v of retail) {
      if (v.inventory_item_id) {
        await sapo("/admin/inventory_levels/set.json", {
          method: "POST",
          body: JSON.stringify({
            location_id: LOCATION_ID,
            inventory_item_id: v.inventory_item_id,
            available: target,
          }),
        });
      }
      retailSkus.push(v.sku);
    }
    synced += retail.length;
    details.push({ phoiSku, phoiAvailable: available, targetQuantity: target, updated: retail.length, retailSkus });
  }

  return { success: true, scannedPhoi: scanned, updatedRetailVariants: synced, details };
}

const result = await run();
console.log(JSON.stringify(result, null, 2));
const row = result.details.find((d) => d.phoiSku === "dtbvc-T-12p");
console.log("\n--- Đối soát SKU dtbvc-T-12p ---");
if (row) {
  console.log(`Tồn phôi: ${row.phoiAvailable} → target thành phẩm: ${row.targetQuantity}`);
  console.log(`Cập nhật ${row.updated} variant: ${row.retailSkus.join(", ") || "(không có)"}`);
}
