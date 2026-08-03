export type SupabasePublicConfig =
  | {
      configured: true;
      publishableKey: string;
      url: string;
    }
  | {
      configured: false;
      missing: ("NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")[];
    };

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

export function getSupabasePublicConfig(): SupabasePublicConfig {
  const missing: (
    | "NEXT_PUBLIC_SUPABASE_URL"
    | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
  )[] = [];

  if (!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!supabasePublishableKey) {
    missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }

  if (!supabaseUrl || !supabasePublishableKey) {
    return { configured: false, missing };
  }

  return {
    configured: true,
    publishableKey: supabasePublishableKey,
    url: supabaseUrl,
  };
}
