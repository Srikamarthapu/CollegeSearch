import { adviserResponse } from "@/app/lib/adviser/service";
import { isAuthorizedAdviserWorker } from "@/app/lib/adviser/worker-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request) {
  const secret = process.env.ADVISER_WORKER_SECRET;
  if (!secret?.trim() || secret.trim().length < 32) return adviserResponse({ message: "Adviser worker is not configured." }, 503);
  if (!isAuthorizedAdviserWorker(request, secret)) {
    return adviserResponse({ message: "Unauthorized." }, 401);
  }
  try {
    const { processOneAdviserJob } = await import("@/app/lib/adviser/worker");
    const result = await processOneAdviserJob();
    return adviserResponse(result);
  } catch {
    return adviserResponse({ message: "Adviser worker could not process the queue." }, 503);
  }
}
