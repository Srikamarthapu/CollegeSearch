/** The configured Auth password hasher accepts at most 72 UTF-8 bytes. */
export function newPasswordError(password: string): string | null {
  if (password.length < 8) return "Use at least 8 characters for your password.";
  if (new TextEncoder().encode(password).length > 72) return "This password is too long for the sign-in service. Use at most 72 bytes (some symbols use more than one byte).";
  return null;
}
