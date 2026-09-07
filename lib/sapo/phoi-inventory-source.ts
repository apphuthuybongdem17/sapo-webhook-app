import { getSapoOmniClient } from "./omni-client";
import { getSapoWebLocationId } from "./web-client";
import type { SapoVariant, SapoVariantsResponse } from "./types";

export type PhoiInventorySource =
  | "inventory_levels.available"
  | "variant.inventory_quantity"
  | "not_found";

export interface PhoiInventoryReadResult {
  phoiSku: string;
  available: number;
  source: PhoiInventorySource;
  dataStore: "sapo_omni_api";
  locationId: number;
  variantId: number | null;
  inventoryItemId: number | null;
  variantModifiedOn: string | null;
  readInventoryScope: boolean;
  note: string;
}

async function fetchPhoiVariantBySku(phoiSku: string): Promise<SapoVariant | null> {
  const client = getSapoOmniClient();
  const { data } = await client.get<SapoVariantsResponse>(
    `/admin/variants.json?query=${encodeURIComponent(phoiSku)}&limit=10`,
  );
  const variants = data.variants ?? [];
  return variants.find((v) => v.sku?.trim() === phoiSku) ?? null;
}

async function fetchAvailableFromInventoryLevels(
  inventoryItemId: number,
  locationId: number,
): Promise<{ available: number | null; denied: boolean }> {
  const client = getSapoOmniClient();
  try {
    const { data } = await client.get<{
      inventory_levels?: Array<{ available?: number; location_id?: number }>;
    }>(
      `/admin/inventory_levels.json?inventory_item_ids=${inventoryItemId}&location_ids=${locationId}`,
    );
    const level = data.inventory_levels?.[0];
    if (level && level.available != null) {
      return { available: Number(level.available), denied: false };
    }
    return { available: null, denied: false };
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response?.status;
    if (status === 403) {
      return { available: null, denied: true };
    }
    throw error;
  }
}

/**
 * Đọc tồn phôi từ Sapo Omni Admin API (cùng backend với Omni POS).
 * Ưu tiên inventory_levels.available (tồn thực theo chi nhánh POS).
 * Fallback variant.inventory_quantity khi thiếu scope read_inventory.
 */
export async function fetchPhoiAvailableQuantity(
  phoiSku: string,
): Promise<PhoiInventoryReadResult> {
  const locationId = getSapoWebLocationId();
  const normalizedSku = phoiSku.trim();

  const variant = await fetchPhoiVariantBySku(normalizedSku);
  if (!variant) {
    return {
      phoiSku: normalizedSku,
      available: 0,
      source: "not_found",
      dataStore: "sapo_omni_api",
      locationId,
      variantId: null,
      inventoryItemId: null,
      variantModifiedOn: null,
      readInventoryScope: false,
      note: `Không tìm thấy variant phôi SKU "${normalizedSku}" trên Sapo API`,
    };
  }

  const inventoryItemId = variant.inventory_item_id ?? null;
  let available: number | null = null;
  let source: PhoiInventorySource = "variant.inventory_quantity";
  let readInventoryScope = true;
  let note = "Đọc từ variant.inventory_quantity trên catalog API";

  if (inventoryItemId) {
    const levelRead = await fetchAvailableFromInventoryLevels(
      inventoryItemId,
      locationId,
    );

    if (levelRead.denied) {
      readInventoryScope = false;
      note =
        "Thiếu scope read_inventory — không đọc được inventory_levels (tồn POS thực). Fallback catalog variant.inventory_quantity (có thể chậm/trễ so với Omni POS).";
    } else if (levelRead.available != null) {
      available = levelRead.available;
      source = "inventory_levels.available";
      note = `Đọc tồn thực từ inventory_levels tại location ${locationId}`;
    }
  }

  if (available == null) {
    available = Number(variant.inventory_quantity ?? 0);
    source = "variant.inventory_quantity";
  }

  const qty = Number.isFinite(available) && available > 0 ? Math.floor(available) : 0;

  console.log(
    `[Phoi Source] sku=${normalizedSku} available=${qty} source=${source} location=${locationId}`,
  );

  return {
    phoiSku: normalizedSku,
    available: qty,
    source,
    dataStore: "sapo_omni_api",
    locationId,
    variantId: variant.id ?? null,
    inventoryItemId,
    variantModifiedOn: (variant as SapoVariant & { modified_on?: string }).modified_on ?? null,
    readInventoryScope,
    note,
  };
}
