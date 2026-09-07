import { getSapoWebClient } from "./web-client";
import {
  isPhoiSku,
  syncPhoiVariantRecord,
} from "./sync-engine";
import type { SapoVariant, SapoVariantsResponse } from "./types";

const DEFAULT_WATCH_PHOI_SKUS = "dtbvc-T-12p,vmln-C-1";

function getWatchPhoiSkus(): Set<string> | null {
  const raw =
    process.env.WATCH_PHOI_SKUS?.trim() || DEFAULT_WATCH_PHOI_SKUS;
  if (!raw) {
    return null;
  }
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

async function fetchVariantBySku(sku: string): Promise<SapoVariant | null> {
  const client = getSapoWebClient();
  const { data } = await client.get<SapoVariantsResponse>(
    `/admin/variants.json?query=${encodeURIComponent(sku)}&limit=10`,
  );
  const variants = data.variants ?? [];
  return variants.find((v) => v.sku?.trim() === sku) ?? null;
}

async function fetchPhoiVariantsPage(page: number): Promise<SapoVariant[]> {
  const client = getSapoWebClient();
  const { data } = await client.get<SapoVariantsResponse>(
    `/admin/variants.json?limit=250&page=${page}`,
  );
  return data.variants ?? [];
}

async function syncWatchList(
  watchList: Set<string>,
): Promise<{
  scanned: number;
  synced: number;
  details: Array<{ phoiSku: string; updated: number; targetQuantity: number }>;
}> {
  const details: Array<{ phoiSku: string; updated: number; targetQuantity: number }> = [];
  let scanned = 0;
  let synced = 0;

  for (const sku of Array.from(watchList)) {
    const variant = await fetchVariantBySku(sku);
    if (!variant) {
      console.warn(`[Poller] Không tìm thấy phôi SKU: ${sku}`);
      details.push({ phoiSku: sku, updated: 0, targetQuantity: 0 });
      continue;
    }

    scanned += 1;
    const result = await syncPhoiVariantRecord(variant);
    if (result.updated > 0) {
      synced += result.updated;
    }
    details.push({
      phoiSku: result.phoiSku,
      updated: result.updated,
      targetQuantity: result.targetQuantity,
    });
  }

  return { scanned, synced, details };
}

/**
 * Quét variant phôi và sync thành phẩm đuôi _{phoiSku}.
 * Mặc định chỉ quét WATCH_PHOI_SKUS (nhanh, <15s). Đặt WATCH_PHOI_SKUS=* để quét full catalog.
 */
export async function pollAndSyncAllPhoi(): Promise<{
  scanned: number;
  synced: number;
  details: Array<{ phoiSku: string; updated: number; targetQuantity: number }>;
}> {
  const watchList = getWatchPhoiSkus();

  if (watchList && !watchList.has("*")) {
    console.log("[Poller] Fast mode — WATCH_PHOI_SKUS:", Array.from(watchList).join(", "));
    const result = await syncWatchList(watchList);
    console.log(
      `[Poller] Quét ${result.scanned} phôi, cập nhật ${result.synced} variant thành phẩm`,
    );
    return result;
  }

  const details: Array<{ phoiSku: string; updated: number; targetQuantity: number }> = [];
  let scanned = 0;
  let synced = 0;
  const maxPages = Number(process.env.POLL_MAX_PAGES ?? "5");

  for (let page = 1; page <= maxPages; page += 1) {
    const variants = await fetchPhoiVariantsPage(page);
    if (!variants.length) {
      break;
    }

    for (const variant of variants) {
      const sku = variant.sku?.trim() ?? "";
      if (!isPhoiSku(sku)) {
        continue;
      }

      scanned += 1;
      const result = await syncPhoiVariantRecord(variant);
      if (result.updated > 0) {
        synced += result.updated;
      }
      details.push({
        phoiSku: result.phoiSku,
        updated: result.updated,
        targetQuantity: result.targetQuantity,
      });
    }

    if (variants.length < 250) {
      break;
    }
  }

  console.log(`[Poller] Full scan — quét ${scanned} phôi, cập nhật ${synced} variant thành phẩm`);
  return { scanned, synced, details };
}
