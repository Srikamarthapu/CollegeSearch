# Revoked-session shortlist confirmation defect

Confirmed September 13, 2026 at 20:42 UTC against private source `450f4b2df8ba4d0f9029fea007c6cde009e5be3c`.

One admin-confirmed disposable account was seeded with Berkeley (110635), Davis (110644), and Irvine (110653). The actual private website signed in through its normal dialog, and both the shortlist and a second account tab showed an up-to-date account. The account's sessions were globally revoked through a separate script session, without reading or changing browser tokens/storage.

Before reloading, removing Berkeley from the already-loaded shortlist made all three colleges disappear. The page said “Account list is up to date” and “No colleges are saved to this account yet.” A privileged database read restricted to the exact disposable user still returned all three rows. The session-active RPC was false. See `session-api.json` and `10-session-revoked-before-fix.png`.

This is a release blocker: successful RLS-filtered empty reads and zero-row deletes must not be acknowledged as a verified account snapshot or completed student intent. RLS itself prevented the revoked session from changing database rows. The defect is in accepting that denied view as successful synchronization.

Remediation and retest evidence will be appended after implementation. Natural token expiry and email delivery are separate acceptance items.
