import { findRetailVariantsByPhoiSku, setVariantInventory } from "./web-client";
import type { SapoVariant } from "./types";

export const STOCK_OPEN_QUANTITY = 9999;
export const STOCK_CLOSED_QUANTITY = 0;

export function isPhoiSku(sku: string): boolean {
  return sku.length > 0 && !sku.includes("_");
}

export function resolveTargetQuantity(available: number): number {
  return available <= 0 ? STOCK_CLOSED_QUANTITY : STOCK_OPEN_QUANTITY;
}

export async function syncPhoiToRetailVariants(
  phoiSku: string,
  available: number,
): Promise<{ updated: number; targetQuantity: number; retailSkus: string[] }> {
  const targetQuantity = resolveTargetQuantity(available);

  console.log(
    `[Sync Engine] phôi="${phoiSku}" available=${available} → thành phẩm đuôi _${phoiSku} → ${targetQuantity}`,
  );

  const variants = await findRetailVariantsByPhoiSku(phoiSku);
  const retailSkus: string[] = [];
  let updated = 0;

  if (!variants.length) {
    console.warn(`[Sync Engine] Không có variant thành phẩm khớp _${phoiSku}`);
    return { updated: 0, targetQuantity, retailSkus };
  }

  for (const variant of variants) {
    try {
      await setVariantInventory(variant, targetQuantity);
      updated += 1;
      if (variant.sku) {
        retailSkus.push(variant.sku);
      }
      console.log(`[Sync Engine] ✓ ${variant.sku} → ${targetQuantity}`);
    } catch (error) {
      console.error(`[Sync Engine] ✗ ${variant.sku}:`, error);
    }
  }

  return { updated, targetQuantity, retailSkus };
}

export async function syncPhoiVariantRecord(
  phoiVariant: SapoVariant,
): Promise<{ updated: number; phoiSku: string; targetQuantity: number }> {
  const phoiSku = phoiVariant.sku?.trim() ?? "";
  const available = Number(phoiVariant.inventory_quantity ?? 0);

  if (!isPhoiSku(phoiSku)) {
    return { updated: 0, phoiSku, targetQuantity: STOCK_CLOSED_QUANTITY };
  }

  const result = await syncPhoiToRetailVariants(phoiSku, available);
  return {
    updated: result.updated,
    phoiSku,
    targetQuantity: result.targetQuantity,
  };
}
