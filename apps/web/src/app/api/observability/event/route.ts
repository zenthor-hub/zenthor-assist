import { NextResponse } from "next/server";
import { z } from "zod";

import { webLogger } from "@/lib/observability/server";

const requestSchema = z.object({
  event: z.string().min(1).max(120),
  level: z.enum(["info", "warn", "error"]).optional().default("info"),
  payload: z.record(z.string(), z.unknown()).optional().default({}),
});

export async function POST(request: Request) {
  let parsedBody: z.infer<typeof requestSchema>;

  try {
    const json = (await request.json()) as unknown;
    parsedBody = requestSchema.parse(json);
  } catch (error) {
    await webLogger.exception("web.client_log.invalid_payload", error, {
      source: "web-client",
      path: "/api/observability/event",
    });
    return new NextResponse(null, { status: 400 });
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  const userAgent = request.headers.get("user-agent");

  const payload = {
    ...parsedBody.payload,
    source: "web-client",
    requestPath: "/api/observability/event",
    forwardedFor,
    userAgent,
  };

  if (parsedBody.level === "error") {
    await webLogger.error(parsedBody.event, payload);
  } else if (parsedBody.level === "warn") {
    await webLogger.warn(parsedBody.event, payload);
  } else {
    await webLogger.info(parsedBody.event, payload);
  }

  return new NextResponse(null, { status: 204 });
}
