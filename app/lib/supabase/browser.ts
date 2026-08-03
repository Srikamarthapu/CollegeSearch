import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "./config";

let browserClient: SupabaseClient | null = null;

/**
 * Returns one browser client for this tab, or null while public Supabase
 * configuration is intentionally absent. Callers should render setup guidance
 * instead of throwing when null is returned.
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  const config = getSupabasePublicConfig();
  if (!config.configured) return null;

  if (!browserClient) {
    browserClient = createBrowserClient(config.url, config.publishableKey, {
      auth: {
        experimental: {
          appendPkceFlowIdToRedirects: true,
        },
      },
    });
  }

  return browserClient;
}
