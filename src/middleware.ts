import { NextResponse, type NextRequest } from "next/server";

function nonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function allowedOrigins(request: NextRequest): Set<string> {
  const allowed = new Set<string>([request.nextUrl.origin]);
  const configured = process.env.APP_URL?.trim();
  if (configured) {
    try {
      allowed.add(new URL(configured).origin);
    } catch {
      // A malformed APP_URL is reported by runtime validation.
    }
  }
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedHost) {
    allowed.add(`${forwardedProto ?? "https"}://${forwardedHost}`);
  }
  return allowed;
}

export function middleware(request: NextRequest) {
  const isDev = process.env.NODE_ENV !== "production";
  const value = nonce();
  const requestId =
    request.headers.get("x-request-id") ?? crypto.randomUUID();

  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (origin && !allowedOrigins(request).has(origin)) {
      return new NextResponse("Cross-origin request rejected", {
        status: 403,
        headers: { "Cache-Control": "no-store" },
      });
    }
  }

  const scriptPolicy = isDev
    ? "'self' 'unsafe-eval' 'unsafe-inline'"
    : `'self' 'nonce-${value}' 'strict-dynamic'`;
  const connectPolicy = isDev ? "'self' ws: wss:" : "'self'";
  const csp = [
    "default-src 'self'",
    `script-src ${scriptPolicy}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectPolicy}`,
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", value);
  requestHeaders.set("x-request-id", requestId);
  // Next reads the nonce from this request header when rendering script tags.
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("x-request-id", requestId);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }

  if (
    /^\/(portal|analyst|admin|account|reports)(\/|$)/.test(
      request.nextUrl.pathname,
    )
  ) {
    response.headers.set("Cache-Control", "private, no-store");
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff2?)$).*)",
  ],
};
