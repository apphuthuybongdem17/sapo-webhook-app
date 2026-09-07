import crypto from "crypto";

const SIGNATURE_HEADERS = [
  "x-sapo-hmac-sha256",
  "X-Sapo-Hmac-Sha256",
  "x-sapo-hmac-sha256-256",
];

export function getWebhookSignature(headers: Headers): string | null {
  for (const name of SIGNATURE_HEADERS) {
    const value = headers.get(name);
    if (value?.trim()) {
      return value.trim();
    }
  }
  return null;
}

function safeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Xác thực webhook Sapo bằng HMAC SHA256 trên raw body.
 * Hỗ trợ chữ ký dạng base64 và hex.
 */
export function verifySapoWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature) {
    return false;
  }

  const base64Digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  if (safeCompare(base64Digest, signature)) {
    return true;
  }

  const hexDigest = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  return safeCompare(hexDigest, signature);
}

export function getWebhookSecret(): string {
  return (
    process.env.SAPO_OMNI_WEBHOOK_SECRET ??
    process.env.SAPO_OMNI_API_SECRET ??
    process.env.SAPO_WEBHOOK_SECRET ??
    process.env.SAPO_WEB_API_SECRET ??
    process.env.SAPO_API_SECRET ??
    ""
  );
}
