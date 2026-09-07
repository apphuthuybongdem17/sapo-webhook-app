import {
  fetchPhoiAvailableQuantity,
  type PhoiInventoryReadResult,
} from "./phoi-inventory-source";
import { syncPhoiToRetailVariants } from "./sync-engine";

const DEFAULT_WATCH_PHOI_SKUS = "dtbvc-T-12p,vmln-C-1";

export interface SyncDetailRow {
  phoiSku: string;
  phoiAvailable: number;
  targetQuantity: number;
  updated: number;
  retailSkus: string[];
  dataSource: string;
  dataStore: string;
  locationId: number;
  readInventoryScope: boolean;
  note: string;
  variantModifiedOn: string | null;
}

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

async function syncOnePhoiSku(
  phoiSku: string,
): Promise<{ read: PhoiInventoryReadResult; sync: Awaited<ReturnType<typeof syncPhoiToRetailVariants>> }> {
  const read = await fetchPhoiAvailableQuantity(phoiSku);
  if (read.source === "not_found") {
    return {
      read,
      sync: { updated: 0, targetQuantity: 0, retailSkus: [] },
    };
  }

  const sync = await syncPhoiToRetailVariants(phoiSku, read.available);
  return { read, sync };
}

function toDetailRow(
  read: PhoiInventoryReadResult,
  sync: Awaited<ReturnType<typeof syncPhoiToRetailVariants>>,
): SyncDetailRow {
  return {
    phoiSku: read.phoiSku,
    phoiAvailable: read.available,
    targetQuantity: sync.targetQuantity,
    updated: sync.updated,
    retailSkus: sync.retailSkus,
    dataSource: read.source,
    dataStore: read.dataStore,
    locationId: read.locationId,
    readInventoryScope: read.readInventoryScope,
    note: read.note,
    variantModifiedOn: read.variantModifiedOn,
  };
}

async function syncWatchList(
  watchList: Set<string>,
): Promise<{ scanned: number; synced: number; details: SyncDetailRow[] }> {
  const details: SyncDetailRow[] = [];
  let scanned = 0;
  let synced = 0;

  for (const sku of Array.from(watchList)) {
    const { read, sync } = await syncOnePhoiSku(sku);
    if (read.source !== "not_found") {
      scanned += 1;
    }
    if (sync.updated > 0) {
      synced += sync.updated;
    }
    details.push(toDetailRow(read, sync));
  }

  return { scanned, synced, details };
}

/**
 * Quét phôi từ Sapo Omni API → sync thành phẩm trên Sapo Web (1:1 số lượng).
 */
export async function pollAndSyncAllPhoi(): Promise<{
  scanned: number;
  synced: number;
  details: SyncDetailRow[];
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

  // Full scan vẫn dùng Web catalog để liệt kê phôi, nhưng tồn đọc qua Omni source
  const { getSapoWebClient } = await import("./web-client");
  const { isPhoiSku } = await import("./sync-engine");
  const client = getSapoWebClient();

  const details: SyncDetailRow[] = [];
  let scanned = 0;
  let synced = 0;
  const maxPages = Number(process.env.POLL_MAX_PAGES ?? "5");

  for (let page = 1; page <= maxPages; page += 1) {
    const { data } = await client.get<{ variants?: Array<{ sku?: string }> }>(
      `/admin/variants.json?limit=250&page=${page}`,
    );
    const variants = data.variants ?? [];
    if (!variants.length) {
      break;
    }

    for (const variant of variants) {
      const sku = variant.sku?.trim() ?? "";
      if (!isPhoiSku(sku)) {
        continue;
      }

      scanned += 1;
      const { read, sync } = await syncOnePhoiSku(sku);
      if (sync.updated > 0) {
        synced += sync.updated;
      }
      details.push(toDetailRow(read, sync));
    }

    if (variants.length < 250) {
      break;
    }
  }

  console.log(`[Poller] Full scan — quét ${scanned} phôi, cập nhật ${synced} variant thành phẩm`);
  return { scanned, synced, details };
}
