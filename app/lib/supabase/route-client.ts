import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest, NextResponse } from "next/server";
import { getSupabasePublicConfig } from "./config";

type PendingCookie = {
  name: string;
  options: CookieOptions;
  value: string;
};

export type SupabaseRouteClient = {
  applyToResponse(response: NextResponse): NextResponse;
  client: SupabaseClient;
};

/**
 * Creates a PKCE-capable route-handler client and queues every auth cookie and
 * cache header until the handler has chosen its final redirect response.
 */
export function createSupabaseRouteClient(
  request: NextRequest,
): SupabaseRouteClient | null {
  const config = getSupabasePublicConfig();
  if (!config.configured) return null;

  const pendingCookies = new Map<string, PendingCookie>();
  const pendingHeaders = new Map<string, string>();

  const client = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach((cookie) => {
          const path = cookie.options.path ?? "/";
          pendingCookies.set(`${cookie.name}:${path}`, cookie);
        });
        Object.entries(headers).forEach(([name, value]) => {
          pendingHeaders.set(name, value);
        });
      },
    },
  });

  return {
    client,
    applyToResponse(response) {
      pendingCookies.forEach(({ name, options, value }) => {
        response.cookies.set(name, value, options);
      });
      pendingHeaders.forEach((value, name) => {
        response.headers.set(name, value);
      });
      return response;
    },
  };
}
