export interface SapoLineItem {
  sku?: string | null;
  quantity?: number;
}

export interface SapoOrderPayload {
  line_items?: SapoLineItem[];
}

export interface SapoRefundLineItem {
  line_item?: SapoLineItem;
  quantity?: number;
}

export interface SapoRefundPayload {
  refund_line_items?: SapoRefundLineItem[];
  order?: SapoOrderPayload;
}

export interface SapoOrderReturnPayload {
  line_items?: SapoLineItem[];
  return_line_items?: SapoLineItem[];
}

export interface SapoVariant {
  id?: number;
  sku?: string;
  inventory_item_id?: number;
  inventory_quantity?: number;
  modified_on?: string;
}

export interface SapoVariantsResponse {
  variants?: SapoVariant[];
}

export type InventoryDirection = "deduct" | "restore";

export const WEBHOOK_TOPICS = {
  ORDER_CREATE: "orders/create",
  ORDER_CANCELLED: "orders/cancelled",
  REFUND_CREATE: "refunds/create",
  ORDER_RETURN_RETURNED: "order_returns/returned",
  ORDER_RETURN_REFUND: "order_returns/refund",
  ORDER_RETURN_PARTIAL_REFUND: "order_returns/partial_refund",
} as const;

export type WebhookTopic = (typeof WEBHOOK_TOPICS)[keyof typeof WEBHOOK_TOPICS];
