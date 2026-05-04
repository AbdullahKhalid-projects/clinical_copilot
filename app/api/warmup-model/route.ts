import { NextResponse } from "next/server";

const GEMMA_BASE_URL =
  process.env.GEMMA_BASE_URL?.trim() ||
  "https://muddasirjaved666--example-gemma-4-e2b-autoround-it-infer-780f02.modal.run/v1";

export async function GET() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 240000);

    // A lightweight GET to the base URL triggers Modal cold-start.
    // Any response (even 404) means the container is alive.
    const res = await fetch(GEMMA_BASE_URL, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeout);

    return NextResponse.json({
      warmedUp: true,
      status: res.status,
    });
  } catch (err: any) {
    // If it times out, the container may still be spinning up in the
    // background, so we treat it as a best-effort success.
    return NextResponse.json({
      warmedUp: true,
      status: "timeout-or-error",
      message: err.message || "Request timed out but model may be warming",
    });
  }
}
