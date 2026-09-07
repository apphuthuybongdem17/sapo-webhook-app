import { findRetailVariantsByPhoiSku, setVariantInventory } from "./web-client";
import type { SapoVariant } from "./types";

export function isPhoiSku(sku: string): boolean {
  return sku.length > 0 && !sku.includes("_");
}

export function resolveTargetQuantity(available: number): number {
  const qty = Number(available);
  if (!Number.isFinite(qty) || qty <= 0) {
    return 0;
  }
  return Math.floor(qty);
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
): Promise<{
  updated: number;
  phoiSku: string;
  phoiAvailable: number;
  targetQuantity: number;
  retailSkus: string[];
}> {
  const phoiSku = phoiVariant.sku?.trim() ?? "";
  const available = Number(phoiVariant.inventory_quantity ?? 0);

  if (!isPhoiSku(phoiSku)) {
    return {
      updated: 0,
      phoiSku,
      phoiAvailable: available,
      targetQuantity: 0,
      retailSkus: [],
    };
  }

  const result = await syncPhoiToRetailVariants(phoiSku, available);
  return {
    updated: result.updated,
    phoiSku,
    phoiAvailable: available,
    targetQuantity: result.targetQuantity,
    retailSkus: result.retailSkus,
  };
}
