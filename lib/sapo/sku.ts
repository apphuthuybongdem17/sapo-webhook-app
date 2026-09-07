/**
 * Trích xuất mã phôi gốc từ SKU dạng "MU01_p2-N-7" → "p2-N-7".
 * Bỏ qua SKU rỗng hoặc không chứa dấu "_".
 */
export function shouldSkipSku(sku: unknown): boolean {
  if (sku == null || typeof sku !== "string") {
    return true;
  }

  const trimmed = sku.trim();
  return trimmed.length === 0 || !trimmed.includes("_");
}

export function extractBaseSku(sku: unknown): string | null {
  if (shouldSkipSku(sku)) {
    return null;
  }

  const trimmed = (sku as string).trim();
  const baseSku = trimmed.split("_").slice(1).join("_");
  return baseSku.length > 0 ? baseSku : null;
}
