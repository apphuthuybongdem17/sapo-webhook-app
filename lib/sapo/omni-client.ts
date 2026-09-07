import axios, { type AxiosInstance } from "axios";

function resolveOmniApiKey(): string {
  return (
    process.env.SAPO_OMNI_API_KEY ??
    process.env.SAPO_API_KEY ??
    ""
  );
}

function resolveOmniApiSecret(): string {
  return (
    process.env.SAPO_OMNI_API_SECRET ??
    process.env.SAPO_OMNI_WEBHOOK_SECRET ??
    process.env.SAPO_API_SECRET ??
    ""
  );
}

function resolveOmniStoreUrl(): string {
  return (
    process.env.SAPO_OMNI_STORE_URL ??
    process.env.SAPO_STORE_URL ??
    ""
  ).replace(/\/+$/, "");
}

export function getSapoOmniClient(): AxiosInstance {
  const apiKey = resolveOmniApiKey();
  const apiSecret = resolveOmniApiSecret();
  const baseURL = resolveOmniStoreUrl();

  if (!apiKey || !apiSecret || !baseURL) {
    throw new Error(
      "Thiếu SAPO_OMNI_API_KEY, SAPO_OMNI_API_SECRET hoặc SAPO_OMNI_STORE_URL",
    );
  }

  return axios.create({
    baseURL,
    auth: { username: apiKey, password: apiSecret },
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    timeout: 15000,
  });
}

export async function fetchPhoiSkuFromOmniInventoryItem(
  inventoryItemId: number,
): Promise<string | null> {
  const client = getSapoOmniClient();
  console.log(
    `[Sapo Omni] GET inventory_items/${inventoryItemId}.json`,
  );

  try {
    const { data } = await client.get<{
      inventory_item?: { sku?: string; id?: number };
    }>(`/admin/inventory_items/${inventoryItemId}.json`);

    const sku = data.inventory_item?.sku?.trim();
    console.log(`[Sapo Omni] inventory_item_id=${inventoryItemId} → sku="${sku ?? ""}"`);
    return sku || null;
  } catch (error) {
    console.error(
      `[Sapo Omni] Không lấy được SKU từ inventory_item_id=${inventoryItemId}:`,
      error,
    );
    return null;
  }
}

export async function registerOmniWebhook(
  topic: string,
  address: string,
): Promise<{ status: number; body: unknown }> {
  const client = getSapoOmniClient();
  const { status, data } = await client.post("/admin/webhooks.json", {
    webhook: { topic, address, format: "json" },
  });
  return { status, body: data };
}

export async function listOmniWebhooks(): Promise<unknown[]> {
  const client = getSapoOmniClient();
  const { data } = await client.get<{ webhooks?: unknown[] }>(
    "/admin/webhooks.json",
  );
  return data.webhooks ?? [];
}
