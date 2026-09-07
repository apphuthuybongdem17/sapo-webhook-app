import { NextRequest, NextResponse } from "next/server";
import {
  getTopicFromHeaders,
  logWebhookHeaders,
  processWebhook,
} from "@/lib/sapo/webhook-processor";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  console.log("=== BẮT ĐẦU NHẬN WEBHOOK ===");

  const topic = getTopicFromHeaders(request.headers);
  console.log("x-sapo-topic nhận được:", topic || "(rỗng)");
  logWebhookHeaders(request.headers);

  let payload: unknown;
  try {
    payload = await request.json();
    console.log("JSON body parse thành công. Keys:", Object.keys(payload as object));
  } catch (error) {
    console.error("Không parse được JSON body:", error);
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    await processWebhook(topic, payload);
  } catch (error) {
    console.error("Lỗi xử lý webhook:", error);
  }

  console.log("=== KẾT THÚC WEBHOOK — trả về 200 ===");
  return NextResponse.json({ success: true }, { status: 200 });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: "ok",
    message: "Sapo webhook endpoint is ready. Send POST requests here.",
  });
}
