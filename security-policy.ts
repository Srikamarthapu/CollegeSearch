const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);
const NONCE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export const NON_CSP_SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
] as const;

/**
 * Returns the single origin that browser-side Supabase Auth may contact.
 *
 * The public project URL is intentionally reduced to an origin before it is
 * placed in CSP. Hosted/custom deployments must use HTTPS; plain HTTP is
 * accepted only for an explicit loopback host used by the local Supabase CLI.
 * Any path, credentials, query, or fragment is rejected instead of being
 * interpolated into a response header.
 */
export function getSupabaseConnectOrigin(
  rawValue = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string | null {
  const value = rawValue?.trim();
  if (!value) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must be an absolute HTTPS URL (or an HTTP loopback URL for local development).",
    );
  }

  const isHttps = url.protocol === "https:";
  const isLoopbackHttp =
    url.protocol === "http:" && LOOPBACK_HOSTNAMES.has(url.hostname);
  const hasOriginOnlyShape =
    !url.username &&
    !url.password &&
    (url.pathname === "/" || url.pathname === "") &&
    !url.search &&
    !url.hash;

  if ((!isHttps && !isLoopbackHttp) || !hasOriginOnlyShape) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must contain only a secure project origin; paths, credentials, query strings, and fragments are not allowed.",
    );
  }

  return url.origin;
}

export function createCspNonce(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

export function createContentSecurityPolicy({
  isDevelopment = process.env.NODE_ENV === "development",
  nonce,
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
}: {
  isDevelopment?: boolean;
  nonce: string;
  supabaseUrl?: string;
}): string {
  if (!NONCE_PATTERN.test(nonce)) {
    throw new Error("CSP nonce must be an unpredictable URL-safe value.");
  }

  const supabaseOrigin = getSupabaseConnectOrigin(supabaseUrl);
  const connectSources = ["'self'"];
  if (supabaseOrigin) connectSources.push(supabaseOrigin);
  if (isDevelopment) connectSources.push("ws:", "wss:");

  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${
      isDevelopment ? " 'unsafe-eval'" : ""
    }`,
    `script-src-elem 'self' 'nonce-${nonce}'`,
    "script-src-attr 'none'",
    "style-src 'self'",
    `style-src-elem 'self' 'nonce-${nonce}'`,
    // Lenis/Motion update element transforms and CSS variables at runtime.
    "style-src-attr 'unsafe-inline'",
    `connect-src ${connectSources.join(" ")}`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "media-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
  ];

  return directives.join("; ");
}
