import { processInventoryForLineItems } from "./inventory";
import type {
  InventoryDirection,
  SapoLineItem,
  SapoOrderPayload,
  SapoOrderReturnPayload,
  SapoRefundPayload,
} from "./types";
import { WEBHOOK_TOPICS } from "./types";

const RESTORE_TOPICS = new Set<string>([
  WEBHOOK_TOPICS.ORDER_CANCELLED,
  WEBHOOK_TOPICS.REFUND_CREATE,
  WEBHOOK_TOPICS.ORDER_RETURN_RETURNED,
  WEBHOOK_TOPICS.ORDER_RETURN_REFUND,
  WEBHOOK_TOPICS.ORDER_RETURN_PARTIAL_REFUND,
]);

const TOPIC_HEADER_NAMES = [
  "x-sapo-topic",
  "X-Sapo-Topic",
  "x-sapo-event",
  "X-Sapo-Event",
  "x-sapo-webhook-topic",
  "X-Sapo-Webhook-Topic",
  "x-bizweb-topic",
  "X-Bizweb-Topic",
];

export function getTopicFromHeaders(headers: Headers): string {
  for (const name of TOPIC_HEADER_NAMES) {
    const value = headers.get(name);
    if (value?.trim()) {
      return value.trim();
    }
  }
  return "";
}

export function logWebhookHeaders(headers: Headers): void {
  headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower.includes("sapo") || lower.includes("topic") || lower.includes("bizweb")) {
      console.log(`Header [${key}]: ${value}`);
    }
  });
}

export function resolveInventoryDirection(topic: string): InventoryDirection | null {
  if (topic === WEBHOOK_TOPICS.ORDER_CREATE) {
    return "deduct";
  }

  if (RESTORE_TOPICS.has(topic)) {
    return "restore";
  }

  return null;
}

function extractLineItemsFromOrder(payload: unknown): SapoLineItem[] {
  const data = payload as { order?: SapoOrderPayload };
  return data.order?.line_items ?? [];
}

function extractLineItemsFromRefund(payload: unknown): SapoLineItem[] {
  const data = payload as SapoRefundPayload & {
    refund?: SapoRefundPayload;
  };

  const refund = data.refund ?? data;

  if (refund.refund_line_items?.length) {
    return refund.refund_line_items.map((refundItem) => ({
      sku: refundItem.line_item?.sku,
      quantity: refundItem.quantity ?? refundItem.line_item?.quantity,
    }));
  }

  return refund.order?.line_items ?? [];
}

function extractLineItemsFromOrderReturn(payload: unknown): SapoLineItem[] {
  const data = payload as SapoOrderReturnPayload & {
    order_return?: SapoOrderReturnPayload;
  };
  const orderReturn = data.order_return ?? data;
  return orderReturn.return_line_items ?? orderReturn.line_items ?? [];
}

export function extractLineItems(topic: string, payload: unknown): SapoLineItem[] {
  const data = payload as Record<string, unknown>;

  if (
    topic === WEBHOOK_TOPICS.REFUND_CREATE ||
    topic.startsWith("order_returns/") ||
    data.refund
  ) {
    if (topic.startsWith("order_returns/") || data.order_return) {
      return extractLineItemsFromOrderReturn(payload);
    }
    return extractLineItemsFromRefund(payload);
  }

  if (data.order) {
    return extractLineItemsFromOrder(payload);
  }

  if (Array.isArray(data.line_items)) {
    return data.line_items as SapoLineItem[];
  }

  return extractLineItemsFromOrder(payload);
}

function resolveTopicFromPayload(payload: unknown): string {
  const data = payload as Record<string, unknown>;
  if (typeof data.topic === "string" && data.topic.trim()) {
    return data.topic.trim();
  }
  return "";
}

export async function processWebhook(
  topic: string,
  payload: unknown,
): Promise<void> {
  const resolvedTopic = topic || resolveTopicFromPayload(payload);

  if (!topic && resolvedTopic) {
    console.log("Topic lấy từ body payload:", resolvedTopic);
  }

  const direction = resolveInventoryDirection(resolvedTopic);

  if (!direction) {
    console.log("Bỏ qua vì topic không hợp lệ: " + resolvedTopic);
    return;
  }

  const lineItems = extractLineItems(resolvedTopic, payload);
  console.log(`Topic hợp lệ: "${resolvedTopic}", direction: "${direction}", số line_items: ${lineItems.length}`);

  if (!lineItems.length) {
    console.warn(`Topic "${resolvedTopic}" không có line_items. Payload keys:`, Object.keys(payload as object));
    return;
  }

  await processInventoryForLineItems(lineItems, direction);
}
