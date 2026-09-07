import { NextRequest, NextResponse } from "next/server";
import {
  isInventoryUpdateTopic,
  processInventorySync,
} from "@/lib/sapo/inventory-sync";
import { getTopicFromHeaders } from "@/lib/sapo/webhook-processor";
import {
  getWebhookSecret,
  getWebhookSignature,
  verifySapoWebhookSignature,
} from "@/lib/sapo/webhook-verify";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  console.log("=== WEBHOOK (realtime) ===");

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (error) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const signature = getWebhookSignature(request.headers);
  const secret = getWebhookSecret();

  if (!secret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  if (!verifySapoWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  const topic = getTopicFromHeaders(request.headers);
  console.log("[Webhook] Topic:", topic);

  if (!isInventoryUpdateTopic(topic)) {
    return NextResponse.json({ success: true, skipped: true }, { status: 200 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const result = await processInventorySync(payload, topic);
    return NextResponse.json({ success: true, ...result }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Processing error";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: "ok",
    architecture: {
      primary:
        "Cron polling (mỗi 5 phút qua cron-job.org hoặc 1 lần/ngày trên Vercel Hobby) — quét phôi qua Sapo Web API → sync thành phẩm",
      secondary:
        "Webhook products/update trên Sapo Web (realtime khi Omni đẩy catalog sang kênh Web)",
    },
    endpoints: {
      webhook: "/api/webhooks/sapo-inventory",
      cron: "/api/cron/sync-inventory",
    },
    productionUrl: "https://sapo-webhook-app.vercel.app",
  });
}
