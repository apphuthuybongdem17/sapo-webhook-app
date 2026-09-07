import { getSapoOmniClient } from "./omni-client";
import { getSapoWebLocationId } from "./web-client";
import type { SapoVariant, SapoVariantsResponse } from "./types";

export type PhoiInventorySource =
  | "variant.inventory_quantity"
  | "not_found";

export interface PhoiInventoryReadResult {
  phoiSku: string;
  available: number;
  source: PhoiInventorySource;
  dataStore: "sapo_variant_api";
  locationId: number;
  variantId: number | null;
  inventoryItemId: number | null;
  variantModifiedOn: string | null;
  note: string;
}

async function findPhoiVariantIdBySku(phoiSku: string): Promise<number | null> {
  const client = getSapoOmniClient();
  const { data } = await client.get<SapoVariantsResponse>(
    `/admin/variants.json?query=${encodeURIComponent(phoiSku)}&limit=10`,
  );
  const match = (data.variants ?? []).find((v) => v.sku?.trim() === phoiSku);
  return match?.id ?? null;
}

/**
 * Đọc tồn phôi qua Variant API (quyền Sản phẩm/phiên bản — không cần inventory_levels).
 * GET /admin/variants/{variant_id}.json → variant.inventory_quantity
 */
async function fetchVariantById(variantId: number): Promise<SapoVariant | null> {
  const client = getSapoOmniClient();
  const { data } = await client.get<{ variant?: SapoVariant }>(
    `/admin/variants/${variantId}.json`,
  );
  return data.variant ?? null;
}

function normalizeQuantity(value: unknown): number {
  const qty = Number(value);
  if (!Number.isFinite(qty) || qty <= 0) {
    return 0;
  }
  return Math.floor(qty);
}

export async function fetchPhoiAvailableQuantity(
  phoiSku: string,
): Promise<PhoiInventoryReadResult> {
  const locationId = getSapoWebLocationId();
  const normalizedSku = phoiSku.trim();

  const variantId = await findPhoiVariantIdBySku(normalizedSku);
  if (!variantId) {
    return {
      phoiSku: normalizedSku,
      available: 0,
      source: "not_found",
      dataStore: "sapo_variant_api",
      locationId,
      variantId: null,
      inventoryItemId: null,
      variantModifiedOn: null,
      note: `Không tìm thấy variant phôi SKU "${normalizedSku}"`,
    };
  }

  const variant = await fetchVariantById(variantId);
  if (!variant) {
    return {
      phoiSku: normalizedSku,
      available: 0,
      source: "not_found",
      dataStore: "sapo_variant_api",
      locationId,
      variantId,
      inventoryItemId: null,
      variantModifiedOn: null,
      note: `Không đọc được variant id=${variantId}`,
    };
  }

  const available = normalizeQuantity(variant.inventory_quantity);

  console.log(
    `[Phoi Source] GET /admin/variants/${variantId}.json → sku=${normalizedSku} inventory_quantity=${available}`,
  );

  return {
    phoiSku: normalizedSku,
    available,
    source: "variant.inventory_quantity",
    dataStore: "sapo_variant_api",
    locationId,
    variantId: variant.id ?? variantId,
    inventoryItemId: variant.inventory_item_id ?? null,
    variantModifiedOn: variant.modified_on ?? null,
    note: `Đọc tồn qua GET /admin/variants/${variantId}.json → inventory_quantity`,
  };
}
