# CollegeSearch authentication setup

The app now has a Supabase Auth foundation for:

- email/password sign up and sign in
- email confirmation
- password reset and password update
- Google OAuth
- cookie-backed PKCE sessions and refresh-token rotation
- signed-in account state and sign out

It intentionally stays in a clear **unconfigured** state until a CollegeSearch
Supabase project is connected. No remote project was created or changed while
building this foundation.

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

These are the only browser-side keys this auth system needs. Do **not** add a
`service_role` key, a secret API key, or the Google client secret to a
`NEXT_PUBLIC_*` variable. This login foundation does not require a service-role
key at all.

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
- To test the verified Codex preview that is currently running on port 4173,
  add the same scoped entries for that origin:
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
   - `http://localhost:4173` while testing the current Codex preview
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
render. The app remains usable when the two public environment variables are
missing; the sign-in dialog shows a student-facing availability message instead
of exposing implementation details or crashing the build.

## 7. Verify before launch

Run this matrix on both local and production origins:

1. Create an email/password account and confirm the email.
2. Sign out and sign back in.
3. Request a password reset, open the newest email in the same browser, and set
   a new password.
4. Sign in with Google and confirm the app returns through `/auth/callback`.
5. Refresh and directly open a second page; the session should persist.
6. Sign out and verify the authenticated UI disappears on refresh.
7. Check the browser console and Supabase Auth logs for errors.

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
