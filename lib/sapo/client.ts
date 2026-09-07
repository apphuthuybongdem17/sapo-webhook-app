import type { SapoVariant, SapoVariantsResponse } from "./types";

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getBasicAuthHeader(): string {
  const apiKey = getEnv("SAPO_API_KEY");
  const apiSecret = getEnv("SAPO_API_SECRET");
  const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  return `Basic ${credentials}`;
}

function getStoreBaseUrl(): string {
  return getEnv("SAPO_STORE_URL").replace(/\/+$/, "");
}

export function buildVariantSearchPath(baseSku: string): string {
  return `/admin/variants.json?query=${encodeURIComponent(`sku:${baseSku}`)}`;
}

export function buildVariantSearchUrl(baseSku: string): string {
  return `${getStoreBaseUrl()}${buildVariantSearchPath(baseSku)}`;
}

export async function sapoFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${getStoreBaseUrl()}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: getBasicAuthHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Sapo API error ${response.status} ${response.statusText}: ${errorBody}`,
    );
  }

  return response.json() as Promise<T>;
}

async function searchVariantsByQuery(query: string): Promise<SapoVariant[]> {
  const path = `/admin/variants.json?query=${encodeURIComponent(query)}`;
  const url = `${getStoreBaseUrl()}${path}`;
  console.log("URL tìm kiếm:", url);

  const data = await sapoFetch<SapoVariantsResponse>(path);
  const variants = data.variants ?? [];
  console.log("Kết quả Sapo trả về:", variants.length);

  return variants;
}

function pickVariant(variants: SapoVariant[], baseSku: string): SapoVariant | null {
  if (!variants.length) {
    return null;
  }

  const exactMatch = variants.find((variant) => variant.sku === baseSku);
  return exactMatch ?? variants[0] ?? null;
}

export async function findVariantBySku(
  baseSku: string,
): Promise<SapoVariant | null> {
  const queries = [`sku:${baseSku}`, `sku:[${baseSku}]`, baseSku];

  for (const query of queries) {
    const variants = await searchVariantsByQuery(query);
    const variant = pickVariant(variants, baseSku);

    if (variant) {
      console.log(
        `Tìm thấy variant: id=${variant.id}, sku=${variant.sku}, inventory_item_id=${variant.inventory_item_id ?? "N/A"}`,
      );
      return variant;
    }

    console.log(`Không có kết quả với query "${query}", thử query tiếp theo...`);
  }

  return null;
}

export function getLocationId(): number {
  const locationId = getEnv("SAPO_LOCATION_ID");
  const parsed = Number(locationId);
  if (!Number.isFinite(parsed)) {
    throw new Error("SAPO_LOCATION_ID must be a valid number");
  }
  return parsed;
}
