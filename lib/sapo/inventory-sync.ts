import { fetchPhoiSkuFromOmniInventoryItem } from "./omni-client";
import {
  isPhoiSku,
  syncPhoiToRetailVariants,
} from "./sync-engine";

/** Topic realtime từ Sapo Web (Omni đồng bộ catalog → bắn products/update) */
const WEBHOOK_TOPICS = new Set([
  "products/update",
  "products/create",
  "inventory_levels/update",
  "inventory_items/update",
  "receive_inventories/update",
  "inventories/update",
]);

export interface ExtractedInventoryData {
  sku: string | null;
  available: number;
  inventoryItemId: number | null;
}

interface InventoryLevelPayload {
  available?: number;
  sku?: string;
  inventory_item_id?: number;
}

interface ProductVariantPayload {
  sku?: string;
  inventory_quantity?: number;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function parseAvailable(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInventoryItemId(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getProductFromPayload(payload: unknown): Record<string, unknown> {
  const root = asRecord(payload);
  if (root.product && typeof root.product === "object") {
    return asRecord(root.product);
  }
  if (Array.isArray(root.variants)) {
    return root;
  }
  return asRecord(root.product);
}

export function isInventoryUpdateTopic(topic: string): boolean {
  return WEBHOOK_TOPICS.has(topic.trim());
}

export function extractInventoryWebhookData(
  payload: unknown,
): ExtractedInventoryData | null {
  const root = asRecord(payload);
  const inventoryLevel = asRecord(root.inventory_level) as InventoryLevelPayload;
  const inventoryItem = asRecord(root.inventory_item);

  const available =
    parseAvailable(inventoryLevel.available) ??
    parseAvailable(root.available) ??
    parseAvailable(inventoryItem.available);

  const sku =
    (typeof inventoryLevel.sku === "string" && inventoryLevel.sku.trim()) ||
    (typeof inventoryItem.sku === "string" && inventoryItem.sku.trim()) ||
    (typeof root.sku === "string" && root.sku.trim()) ||
    null;

  const inventoryItemId =
    parseInventoryItemId(inventoryLevel.inventory_item_id) ??
    parseInventoryItemId(root.inventory_item_id) ??
    parseInventoryItemId(inventoryItem.id);

  if (available == null) {
    return null;
  }
  if (!sku && !inventoryItemId) {
    return null;
  }

  return { sku, available, inventoryItemId };
}

export async function resolvePhoiSku(
  data: ExtractedInventoryData,
): Promise<string | null> {
  if (data.sku && isPhoiSku(data.sku)) {
    return data.sku;
  }
  if (data.inventoryItemId) {
    return fetchPhoiSkuFromOmniInventoryItem(data.inventoryItemId);
  }
  return null;
}

function extractFromProductPayload(payload: unknown): ExtractedInventoryData[] {
  const product = getProductFromPayload(payload);
  const variants = Array.isArray(product.variants)
    ? (product.variants as ProductVariantPayload[])
    : [];

  const results: ExtractedInventoryData[] = [];
  for (const variant of variants) {
    const sku = typeof variant.sku === "string" ? variant.sku.trim() : "";
    const available = parseAvailable(variant.inventory_quantity);
    if (!sku || !isPhoiSku(sku) || available == null) {
      continue;
    }
    results.push({ sku, available, inventoryItemId: null });
  }
  return results;
}

export async function processInventorySync(
  payload: unknown,
  topic = "",
): Promise<{ updated: number; targetQuantity: number; phoiSku: string; source: string }> {
  const normalizedTopic = topic.trim();

  if (normalizedTopic === "products/update" || normalizedTopic === "products/create") {
    const phoiItems = extractFromProductPayload(payload);
    if (!phoiItems.length) {
      throw new Error("products/update: không có variant phôi trong payload");
    }

    let totalUpdated = 0;
    let lastPhoiSku = "";
    let lastTarget = 0;

    for (const item of phoiItems) {
      const result = await syncPhoiToRetailVariants(item.sku!, item.available);
      totalUpdated += result.updated;
      lastPhoiSku = item.sku!;
      lastTarget = result.targetQuantity;
    }

    return {
      updated: totalUpdated,
      targetQuantity: lastTarget,
      phoiSku: lastPhoiSku,
      source: "webhook-products-update",
    };
  }

  const extracted = extractInventoryWebhookData(payload);
  if (!extracted) {
    throw new Error("Không trích xuất được dữ liệu tồn kho từ payload");
  }

  const phoiSku = await resolvePhoiSku(extracted);
  if (!phoiSku) {
    throw new Error("Không xác định được SKU phôi");
  }

  const result = await syncPhoiToRetailVariants(phoiSku, extracted.available);
  return {
    updated: result.updated,
    targetQuantity: result.targetQuantity,
    phoiSku,
    source: "webhook-inventory",
  };
}
