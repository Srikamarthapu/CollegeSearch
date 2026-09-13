# CollegeSearch authentication setup

The app now has a Supabase Auth foundation for:

- email/password sign up and sign in
- email confirmation
- password reset and password update
- Google OAuth
- cookie-backed PKCE sessions and refresh-token rotation
- signed-in account state and sign out
- account-synced college saves with an explicit browser-list import

On September 13, 2026, a dedicated CollegeSearch project was created in the
Bluee12132 organization. Ooru was paused with the owner’s approval to free a
free-plan project slot. Local and hosted two-user isolation, session revocation,
and cascade-deletion integration checks passed. Local `.env.local` targets
CollegeSearch. Hosting environment values and actual student email delivery
must be verified separately before launch.

## 1. Install the pinned client packages

These were the current releases verified on 2026-08-01:

```bash
npm install --save-exact @supabase/supabase-js@2.111.0 @supabase/ssr@0.12.4
```

Commit both `package.json` and `package-lock.json`. The project already requires
Node.js 22, which satisfies the current Supabase client runtime requirement.

## 2. Create or choose a Supabase project

In the Supabase dashboard, open the CollegeSearch project and copy these two
public values from **Connect** or **Project Settings → API**:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

Add them to `.env.local` for local development and to the hosting provider's
environment settings for production. Restart the app after adding them.

`NEXT_PUBLIC_SUPABASE_URL` must be an origin-only HTTPS URL, such as the value
shown above. A path, credentials, query string, fragment, or public HTTP URL
causes the production build to fail closed. Plain HTTP is accepted only for
`localhost`, `127.0.0.1`, or `[::1]` when using a local Supabase stack. The
origin is the only Supabase value copied into the browser Content Security
Policy; the publishable key is never placed in a response header.

These are the only browser-side keys this auth system needs. Do **not** add a
`service_role` key, a secret API key, or the Google client secret to a
`NEXT_PUBLIC_*` variable. The account deletion endpoint requires `SUPABASE_SECRET_KEY` on the server.
It verifies the caller and active session, revokes sessions, and deletes only
that verified account. Keep it ignored locally and marked secret in hosting.

Before testing account-synced saves, apply the committed
`supabase/migrations/20260810042855_create_saved_colleges.sql` and
`supabase/migrations/20260913184505_account_session_validation.sql` migrations and
follow the two-user RLS verification matrix in `SUPABASE_DATABASE_SETUP.md`.
The repository's static SQL tests verify the intended contract, but they are
not evidence that a hosted project's policies were applied correctly.

## 3. Configure Supabase URL settings

Open **Authentication → URL Configuration**.

- Set **Site URL** to the final production origin, such as
  `https://collegesearch.example`.
- Add these production redirects (two exact paths plus scoped PKCE patterns):
  - `https://collegesearch.example/auth/callback`
  - `https://collegesearch.example/auth/recovery-callback`
  - `https://collegesearch.example/auth/callback\?sb_flow_id=*`
  - `https://collegesearch.example/auth/recovery-callback\?sb_flow_id=*`
- Add local redirects:
  - `http://localhost:3000/auth/callback`
  - `http://localhost:3000/auth/recovery-callback`
  - `http://localhost:3000/auth/callback\?sb_flow_id=*`
  - `http://localhost:3000/auth/recovery-callback\?sb_flow_id=*`
- Add the same four exact/scoped entries with `127.0.0.1` when that is the
  hostname used for local development. Supabase matches the full origin, so
  `localhost` and `127.0.0.1` are not interchangeable.
- If testing a local production preview on port 4173, add the same scoped
  entries for that origin:
  - `http://localhost:4173/auth/callback`
  - `http://localhost:4173/auth/recovery-callback`
  - `http://localhost:4173/auth/callback\?sb_flow_id=*`
  - `http://localhost:4173/auth/recovery-callback\?sb_flow_id=*`
- If deployment previews need auth, add a narrowly scoped preview wildcard.
  Supabase permits `http://localhost:3000/**` for local development, but its
  current guidance recommends exact paths in production.

`/auth/callback` exchanges PKCE codes for email confirmation and Google sign-in.
The dedicated `/auth/recovery-callback` exchanges password-recovery codes and
continues to `/auth/update-password`. Using two exact paths keeps Supabase's
redirect allow list strict and avoids query-string matching surprises.
The narrowly scoped `sb_flow_id=*` patterns support two auth attempts opened in
different tabs without broadening the allow list to unrelated routes.

## 4. Keep the email flows compatible with PKCE

Keep the Email provider enabled in **Authentication → Providers**. The app sets
`emailRedirectTo` to `/auth/callback` and password recovery to the dedicated
`/auth/recovery-callback`, so Supabase's default templates work without
customization. Keep the default `{{ .ConfirmationURL }}`
link in both the confirmation and recovery templates; Supabase verifies the
email action and redirects the PKCE code to CollegeSearch for exchange.

This matters for new Free projects: since 2026-06-03, Supabase's hosted default
SMTP does not allow customized email templates. CollegeSearch does not depend
on custom templates, so confirmation and recovery remain testable on that tier.

For a real launch, configure a custom SMTP provider in Supabase. The hosted
default email service is restricted/rate-limited and is intended for early
testing, not reliable student-facing delivery. SMTP credentials belong in the
Supabase dashboard, not in the browser environment.

## 5. Add Google sign-in

1. In Google Cloud, open **Google Auth Platform** and configure Branding,
   Audience, and the basic profile/email scopes.
2. Create an OAuth client with application type **Web application**.
3. Under **Authorized JavaScript origins**, add:
   - `http://localhost:3000`
   - `http://localhost:4173` while testing a local production preview
   - `http://127.0.0.1:3000` when using the numeric loopback hostname
   - `http://127.0.0.1:4173` for the CollegeSearch production preview
   - the final production origin
4. In Supabase, open **Authentication → Providers → Google**. Copy the callback
   URL shown there. It is normally:

   ```text
   https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
   ```

   If the project uses a custom Auth domain, use the exact callback shown by
   Supabase instead.
5. Add that Supabase callback as the Google client’s **Authorized redirect URI**.
6. Paste the Google **Client ID** and **Client Secret** into the Supabase Google
   provider screen, then enable and save the provider.

The Google client secret stays in Supabase. CollegeSearch does not need it in
`.env.local` or in hosting environment variables.

## 6. Wire the UI into the existing shell

Wrap the existing application providers with `AuthProvider` in
`app/providers.tsx`:

```tsx
<AuthProvider>
  <MotionConfig>{children}</MotionConfig>
</AuthProvider>
```

Then render `AuthAccountControl` in `app/components/SiteHeader.tsx` where the
Sign in/account control should appear. The control includes the dialog,
server-verified session observation, account display, and sign out.

The root `proxy.ts` is already included. It refreshes cookie sessions and
forwards Supabase’s required private/no-store response headers before pages
render. The same proxy creates a fresh CSP nonce for each document request.
Vinext applies that nonce to its inline hydration scripts and generated font
styles, while `connect-src` permits only the CollegeSearch origin and the exact
validated Supabase project origin. Compiled `/assets/` files and static images
skip auth refresh work. The app remains usable when the two public environment
variables are missing; the sign-in dialog shows a student-facing availability
message instead of exposing implementation details or crashing the build.

Nonce-backed documents are intentionally dynamic and must not be cached at a
CDN. Supabase already supplies private/no-store response headers when it rotates
a session; verify that the final hosting/CDN configuration honors them and does
not cache any response containing `Set-Cookie`.

## 7. Verify before launch

Run this matrix on both local and production origins:

1. Create an email/password account and confirm the email.
2. Sign out and sign back in.
3. Request a password reset, open the newest email in the same browser, and set
   a new password.
4. If Google sign-in is enabled, confirm it returns through `/auth/callback`.
   Otherwise verify that the unconfigured provider is not offered.
5. Refresh and directly open a second page; the session should persist.
6. Sign out and verify the authenticated UI disappears on refresh.
7. Check the browser console and Supabase Auth logs for errors.
8. Inspect two fresh document responses. Each must have a different nonce in
   `Content-Security-Policy`, and every inline `script` and `style` must carry
   the matching nonce. Confirm there are no CSP violations during sign-up,
   any enabled Google sign-in, recovery, navigation, or Lenis/Motion interactions.
9. While signed out, save colleges and confirm that signing in does not upload
   them automatically. Use the explicit import action and confirm that only the
   selected account receives those rows.
10. Save and remove colleges while offline, reload, reconnect, and retry. The
    intended state must remain visible and reach the account after retry without
    resurrecting a deleted college.
11. Repeat save/remove actions in two tabs, then switch between two test
    accounts. No account may briefly display, import, or mutate the other
    account's list.
12. Run the live anonymous/two-user RLS matrix from
    `SUPABASE_DATABASE_SETUP.md` against a non-production project.

CollegeSearch deliberately keeps `'self'` in `script-src` instead of enabling
`'strict-dynamic'`. Vinext's trusted bootstrap receives the nonce, but React 19
currently emits additional same-origin `modulepreload` hints without one.
Allowing only same-origin module files preserves those performance hints while
still blocking every unnonced inline script and every cross-origin script.

Do not use `user_metadata` for permissions or database authorization. It is
user-editable and is used here only to display the person’s name. Any future
user-owned tables must enable RLS and authorize rows with `auth.uid()`.

## Current official references

- [Supabase Next.js Auth quickstart](https://supabase.com/docs/guides/auth/quickstarts/nextjs)
- [Creating SSR clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Choosing a server package](https://supabase.com/docs/guides/auth/choosing-a-server-package)
- [Password authentication](https://supabase.com/docs/guides/auth/passwords)
- [Google login](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)

## September 2026 release verification

Use Supabase CLI 2.117.0 or newer with the committed local configuration.
The local stack uses API 55321 and database 55322 to avoid other projects.
Run `node scripts/verify-account-integration.mjs <ignored-json> <report-json>` with API_URL, PUBLISHABLE_KEY and SECRET_KEY in the protected JSON file. The script creates and removes synthetic users; never point test cleanup at existing student accounts. Reports contain no credentials.

Supabase default email reaches only organization members and is limited to two messages per hour. Configure a verified sending domain and custom SMTP before inviting students. Test confirmation and recovery from the exact deployed origin. Google is hidden unless `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true`; enable it only after provider configuration and callback verification. Read [Supabase SMTP guidance](https://supabase.com/docs/guides/auth/auth-smtp).

Account deletion uses a durable per-account browser receipt to prevent resumed tabs from recreating deleted notes. It retains guest/other-account data. It cannot erase downloads or inaccessible copies on other devices. The browser does not unconditionally sign out after an asynchronous deletion response because another account may have signed in; server session revocation and restrictive RLS remain authoritative.
