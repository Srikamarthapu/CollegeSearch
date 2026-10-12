import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicConfig } from "./config";

/**
 * Refreshes an expired cookie session before a route renders. getClaims()
 * validates the JWT and performs refresh-token rotation when needed.
 */
export async function updateSupabaseSession(
  request: NextRequest,
  forwardedRequestHeaders = new Headers(request.headers),
) {
  const config = getSupabasePublicConfig();
  // A guest has nothing to refresh. Avoid constructing an Auth client on every
  // public request, especially on catalog/cache traffic.
  const hasSessionCookie = request.cookies.getAll().some(({ name }) =>
    /^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/.test(name),
  );
  if (!config.configured || !hasSessionCookie) {
    return NextResponse.next({
      request: { headers: forwardedRequestHeaders },
    });
  }

  const pendingCookies = new Map<
    string,
    {
      name: string;
      options: Parameters<NextResponse["cookies"]["set"]>[2];
      value: string;
    }
  >();
  const pendingHeaders = new Map<string, string>();

  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, options, value }) => {
          request.cookies.set(name, value);
          const path = options.path ?? "/";
          pendingCookies.set(`${name}:${path}`, { name, options, value });
        });
        Object.entries(headers).forEach(([name, value]) => {
          pendingHeaders.set(name, value);
        });
      },
    },
  });

  // Do not use the unverified user object from getSession() for authorization.
  await supabase.auth.getClaims();

  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader) forwardedRequestHeaders.set("cookie", cookieHeader);
  else forwardedRequestHeaders.delete("cookie");

  const response = NextResponse.next({
    request: { headers: forwardedRequestHeaders },
  });
  pendingCookies.forEach(({ name, options, value }) => {
    response.cookies.set(name, value, options);
  });
  pendingHeaders.forEach((value, name) => {
    response.headers.set(name, value);
  });

  return response;
}
