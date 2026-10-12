export type SupabasePublicConfig =
  | {
      configured: true;
      publishableKey: string;
      url: string;
    }
  | {
      configured: false;
      missing: ("NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")[];
      reason: "invalid-publishable-key" | "missing" | "unsafe-publishable-key";
    };

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

function decodeLegacyJwtRole(key: string) {
  const segments = key.split(".");
  if (segments.length !== 3) return null;

  try {
    const normalized = segments[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(segments[1].length / 4) * 4, "=");
    const payload = JSON.parse(atob(normalized)) as { role?: unknown };
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

function publicKeySafety(key: string) {
  if (key.startsWith("sb_secret_")) return "unsafe" as const;
  if (/^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(key)) {
    return "valid" as const;
  }

  const legacyRole = decodeLegacyJwtRole(key);
  if (legacyRole === "anon") return "valid" as const;
  if (legacyRole) return "unsafe" as const;
  return "invalid" as const;
}

export function resolveSupabasePublicConfig(
  urlValue: string | undefined,
  publishableKeyValue: string | undefined,
): SupabasePublicConfig {
  const url = urlValue?.trim();
  const publishableKey = publishableKeyValue?.trim();
  const missing: (
    | "NEXT_PUBLIC_SUPABASE_URL"
    | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
  )[] = [];

  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!publishableKey) {
    missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }

  if (!url || !publishableKey) {
    return { configured: false, missing, reason: "missing" };
  }

  const safety = publicKeySafety(publishableKey);
  if (safety !== "valid") {
    return {
      configured: false,
      missing: [],
      reason:
        safety === "unsafe"
          ? "unsafe-publishable-key"
          : "invalid-publishable-key",
    };
  }

  return {
    configured: true,
    publishableKey,
    url,
  };
}

export function getSupabasePublicConfig(): SupabasePublicConfig {
  return resolveSupabasePublicConfig(supabaseUrl, supabasePublishableKey);
}
