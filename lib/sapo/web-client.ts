import axios, { type AxiosInstance } from "axios";
import type { SapoVariant, SapoVariantsResponse } from "./types";

function getEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function resolveSapoWebApiKey(): string {
  return (
    process.env.SAPO_WEB_API_KEY ??
    process.env.SAPO_WEB_API_TOKEN ??
    process.env.SAPO_API_KEY ??
    ""
  );
}

function resolveSapoWebApiSecret(): string {
  return (
    process.env.SAPO_WEB_API_SECRET ??
    process.env.SAPO_WEBHOOK_SECRET ??
    process.env.SAPO_API_SECRET ??
    ""
  );
}

function resolveSapoWebStoreUrl(): string {
  return (
    process.env.SAPO_WEB_STORE_URL ??
    process.env.SAPO_STORE_DOMAIN ??
    process.env.SAPO_STORE_URL ??
    ""
  ).replace(/\/+$/, "");
}

function createSapoWebClient(): AxiosInstance {
  const apiKey = resolveSapoWebApiKey();
  const apiSecret = resolveSapoWebApiSecret();
  const baseURL = resolveSapoWebStoreUrl();

  if (!apiKey) {
    throw new Error(
      "Missing SAPO_WEB_API_KEY or SAPO_WEB_API_TOKEN environment variable",
    );
  }
  if (!apiSecret) {
    throw new Error(
      "Missing SAPO_WEB_API_SECRET or SAPO_WEBHOOK_SECRET environment variable",
    );
  }
  if (!baseURL) {
    throw new Error(
      "Missing SAPO_WEB_STORE_URL or SAPO_STORE_DOMAIN environment variable",
    );
  }

  return axios.create({
    baseURL,
    auth: {
      username: apiKey,
      password: apiSecret,
    },
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    timeout: 15000,
  });
}

let webClient: AxiosInstance | null = null;

export function getSapoWebClient(): AxiosInstance {
  if (!webClient) {
    webClient = createSapoWebClient();
  }
  return webClient;
}

export function getSapoWebLocationId(): number {
  const raw = getEnv("SAPO_WEB_LOCATION_ID", process.env.SAPO_LOCATION_ID);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error("SAPO_WEB_LOCATION_ID must be a valid number");
  }
  return parsed;
}

/** Variant thành phẩm: SKU kết thúc bằng _{mãPhoi}, VD: KT_dtbvc-T-12p */
export function isRetailVariantSku(variantSku: string, phoiSku: string): boolean {
  return variantSku.endsWith(`_${phoiSku}`) && variantSku !== phoiSku;
}

async function enrichVariant(variant: SapoVariant): Promise<SapoVariant> {
  if (variant.inventory_item_id || !variant.id) {
    return variant;
  }

  const client = getSapoWebClient();
  const { data } = await client.get<{ variant?: SapoVariant }>(
    `/admin/variants/${variant.id}.json`,
  );
  return data.variant ?? variant;
}

export async function findRetailVariantsByPhoiSku(
  phoiSku: string,
): Promise<SapoVariant[]> {
  const client = getSapoWebClient();
  const queries = [phoiSku, `sku:${phoiSku}`];
  const matched = new Map<number, SapoVariant>();

  for (const query of queries) {
    const url = `/admin/variants.json?query=${encodeURIComponent(query)}&limit=250`;
    console.log("[Sapo Web] URL tìm kiếm variant:", `${client.defaults.baseURL}${url}`);

    try {
      const { data } = await client.get<SapoVariantsResponse>(url);
      const variants = data.variants ?? [];
      console.log(`[Sapo Web] Query "${query}" trả về:`, variants.length, "variant(s)");

      for (const variant of variants) {
        if (!variant.id || !variant.sku) {
          continue;
        }

        if (isRetailVariantSku(variant.sku, phoiSku)) {
          console.log(`[Sapo Web] Khớp variant thành phẩm: ${variant.sku}`);
          matched.set(variant.id, variant);
        }
      }
    } catch (error) {
      console.warn(`[Sapo Web] Lỗi query "${query}":`, error);
    }
  }

  const enriched: SapoVariant[] = [];
  for (const variant of Array.from(matched.values())) {
    enriched.push(await enrichVariant(variant));
  }

  console.log(`[Sapo Web] Tổng variant thành phẩm khớp đuôi _${phoiSku}:`, enriched.length);
  return enriched;
}

export async function setVariantInventory(
  variant: SapoVariant,
  available: number,
): Promise<void> {
  const client = getSapoWebClient();
  const fullVariant = await enrichVariant(variant);

  if (fullVariant.inventory_item_id) {
    const locationId = getSapoWebLocationId();
    console.log(
      `[Sapo Web] SET inventory_levels: variant_id=${fullVariant.id}, sku=${fullVariant.sku}, available=${available}`,
    );
    await client.post("/admin/inventory_levels/set.json", {
      location_id: locationId,
      inventory_item_id: fullVariant.inventory_item_id,
      available,
    });
    return;
  }

  if (!fullVariant.id) {
    throw new Error(`Variant thiếu id (sku=${fullVariant.sku})`);
  }

  console.log(
    `[Sapo Web] PUT variant inventory: id=${fullVariant.id}, sku=${fullVariant.sku}, quantity=${available}`,
  );
  await client.put(`/admin/variants/${fullVariant.id}.json`, {
    variant: {
      id: fullVariant.id,
      inventory_quantity: available,
    },
  });
}

/** @deprecated Dùng findRetailVariantsByPhoiSku */
export async function findVariantsByPhoiSku(phoiSku: string): Promise<SapoVariant[]> {
  return findRetailVariantsByPhoiSku(phoiSku);
}
