export type AccountDeletionServices = {
  verify: (token: string) => Promise<{ id: string; active: boolean } | null>;
  revokeSessions: (token: string) => Promise<boolean>;
  deleteUser: (id: string) => Promise<boolean>;
};

const response = (status: number, message: string) => Response.json({ message }, {
  status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
});

/** The caller supplies no target user id: identity comes only from Auth. */
export async function deleteCurrentAccount(request: Request, services: AccountDeletionServices | null) {
  if (request.method !== "DELETE") return response(405, "Use the account deletion control.");
  if (request.headers.get("origin") !== new URL(request.url).origin) return response(403, "Open account settings on this site to delete your account.");
  if (request.headers.get("x-collegesearch-confirm-delete") !== "delete-my-account") return response(400, "Confirm account deletion in account settings.");
  const token = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1];
  if (!token || token.length > 10000) return response(401, "Sign in again before deleting your account.");
  if (!services) return response(503, "Account deletion is not configured on this server. Your account has not changed.");
  try {
    const identity = await services.verify(token);
    if (!identity?.active) return response(401, "Sign in again before deleting your account.");
    if (!await services.revokeSessions(token)) return response(503, "Could not revoke account sessions. Nothing was deleted. Try again shortly.");
    if (!await services.deleteUser(identity.id)) return response(503, "Sessions were revoked, but account deletion failed. Sign in again and retry deletion.");
    return response(200, "Your account and its synced college list have been deleted.");
  } catch {
    return response(503, "Could not complete account deletion. Sign in again to check your account and retry.");
  }
}
