import { NextRequest, NextResponse } from "next/server";
import { pollAndSyncAllPhoi } from "@/lib/sapo/inventory-poller";

export const runtime = "nodejs";
export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
  const cronSecret =
    process.env.CRON_SECRET?.trim() ||
    process.env.SAPO_WEBHOOK_SECRET?.trim() ||
    "";

  if (!cronSecret) {
    console.warn("[Cron] CRON_SECRET chưa cấu hình — cho phép chạy (dev only)");
    return process.env.NODE_ENV !== "production";
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  const querySecret = request.nextUrl.searchParams.get("secret");
  if (querySecret === cronSecret) {
    return true;
  }

  // Vercel Cron (Pro) tự gửi header này
  if (request.headers.get("x-vercel-cron") === "1") {
    return true;
  }

  return false;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  console.log("=== CRON: Poll tồn kho phôi Omni → Sync Sapo Web ===");

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await pollAndSyncAllPhoi();
    return NextResponse.json({
      success: true,
      mode: "polling",
      dataFlow:
        "Đọc tồn phôi từ Sapo Omni Admin API → cập nhật variant thành phẩm trên Sapo Web (1:1)",
      scannedPhoi: result.scanned,
      updatedRetailVariants: result.synced,
      details: result.details,
    });
  } catch (error) {
    console.error("[Cron] Lỗi:", error);
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return GET(request);
}
