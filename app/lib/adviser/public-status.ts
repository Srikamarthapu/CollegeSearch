import runtimeSummary from "@/data/college-runtime-summary.json";
import { getSupabasePublicConfig } from "../supabase/config";
import { nvidiaConfigFromEnv } from "./nvidia";

export type AdviserPublicStatus = { available: boolean; monthlyAllowance: number | null; catalogCount: number };
export function configuredLimit(value: string | undefined, max: number) {
  if (!value || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 1 && number <= max ? number : null;
}
export function getAdviserPublicStatus(): AdviserPublicStatus {
  try {
    const provider = nvidiaConfigFromEnv();
    const allowance = configuredLimit(process.env.ADVISER_MONTHLY_ALLOWANCE, 1000);
    const global = configuredLimit(process.env.ADVISER_GLOBAL_MONTHLY_ATTEMPTS, 100000);
    const workerSecret = process.env.ADVISER_WORKER_SECRET?.trim();
    const available = provider.mode === "production" && provider.productionAuthorized && !!provider.apiKey?.trim() &&
      process.env.ADVISER_EVALUATION_PASSED === "true" && !!allowance && !!global &&
      !!workerSecret && workerSecret.length >= 32 &&
      !!process.env.SUPABASE_SECRET_KEY?.trim() && getSupabasePublicConfig().configured &&
      (process.env.CRON_SECRET?.length ?? 0) >= 32;
    return { available, monthlyAllowance: available ? allowance : null, catalogCount: runtimeSummary.institutionCount };
  } catch { return { available: false, monthlyAllowance: null, catalogCount: runtimeSummary.institutionCount }; }
}
