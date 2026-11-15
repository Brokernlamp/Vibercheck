import { headers } from "next/headers";
import { hashIp } from "./crypto";
import { trustProxy } from "./env";

export interface RequestContext {
  ipHash: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export function clientIpFromHeaders(headerMap: Headers): string | null {
  if (trustProxy()) {
    const forwarded = headerMap.get("x-forwarded-for");
    if (forwarded) {
      const first = forwarded.split(",")[0]?.trim();
      if (first) return first;
    }
    const realIp = headerMap.get("x-real-ip")?.trim();
    if (realIp) return realIp;
  }
  return null;
}

export function contextFromHeaders(headerMap: Headers): RequestContext {
  return {
    ipHash: hashIp(clientIpFromHeaders(headerMap)),
    userAgent: headerMap.get("user-agent")?.slice(0, 300) ?? null,
    requestId: headerMap.get("x-request-id"),
  };
}

export async function requestContext(): Promise<RequestContext> {
  return contextFromHeaders(await headers());
}
