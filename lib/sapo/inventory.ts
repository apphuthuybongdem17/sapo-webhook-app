import {
  findVariantBySku,
  getLocationId,
  sapoFetch,
} from "./client";
import { extractBaseSku, shouldSkipSku } from "./sku";
import type { InventoryDirection, SapoLineItem, SapoVariant } from "./types";

interface AdjustInventoryPayload {
  location_id: number;
  inventory_item_id: number;
  available_adjustment: number;
}

function resolveQuantity(item: SapoLineItem): number {
  const quantity = item.quantity ?? 0;
  return quantity > 0 ? quantity : 0;
}

function toAdjustment(
  quantity: number,
  direction: InventoryDirection,
): number {
  return direction === "deduct" ? -quantity : quantity;
}

async function adjustInventoryByItemId(
  inventoryItemId: number,
  adjustment: number,
): Promise<void> {
  const payload: AdjustInventoryPayload = {
    location_id: getLocationId(),
    inventory_item_id: inventoryItemId,
    available_adjustment: adjustment,
  };

  console.log("Gọi POST /admin/inventory_levels/adjust.json:", payload);
  await sapoFetch("/admin/inventory_levels/adjust.json", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function adjustInventoryByVariantId(
  variant: SapoVariant,
  adjustment: number,
): Promise<void> {
  if (!variant.id) {
    throw new Error("Variant không có id để điều chỉnh kho");
  }

  const payload = {
    variant: {
      id: variant.id,
      inventory_quantity_adjustment: adjustment,
    },
  };

  console.log(`Gọi PUT /admin/variants/${variant.id}.json:`, payload);
  await sapoFetch(`/admin/variants/${variant.id}.json`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

async function adjustInventory(
  variant: SapoVariant,
  adjustment: number,
): Promise<void> {
  if (variant.inventory_item_id) {
    await adjustInventoryByItemId(variant.inventory_item_id, adjustment);
    return;
  }

  await adjustInventoryByVariantId(variant, adjustment);
}

async function processLineItem(
  item: SapoLineItem,
  direction: InventoryDirection,
): Promise<void> {
  const sku = item.sku ?? "";
  console.log("Đang quét SKU:", sku);

  if (shouldSkipSku(item.sku)) {
    console.log("Bỏ qua SKU: " + sku);
    return;
  }

  const maPhoi = extractBaseSku(item.sku)!;
  console.log("Mã phôi sau khi cắt chuỗi:", maPhoi);

  const quantity = resolveQuantity(item);
  if (quantity === 0) {
    console.log(`Bỏ qua SKU "${sku}" — quantity = 0`);
    return;
  }

  const actionLabel = direction === "deduct" ? "trừ kho" : "cộng kho";
  console.log(`Bắt đầu gọi API ${actionLabel} cho mã: ` + maPhoi);

  try {
    const variant = await findVariantBySku(maPhoi);

    if (!variant) {
      console.warn(`Không tìm thấy mã phôi "${maPhoi}" trong kho tổng. Bỏ qua.`);
      return;
    }

    const adjustment = toAdjustment(quantity, direction);
    await adjustInventory(variant, adjustment);

    console.log(
      `Hoàn tất ${actionLabel}: maPhoi=${maPhoi}, variant_id=${variant.id}, adjustment=${adjustment}`,
    );
  } catch (error) {
    console.error(`Lỗi xử lý SKU "${sku}" (mã phôi: ${maPhoi}):`, error);
  }
}

export async function processInventoryForLineItems(
  lineItems: SapoLineItem[],
  direction: InventoryDirection,
): Promise<void> {
  for (const item of lineItems) {
    await processLineItem(item, direction);
  }
}
