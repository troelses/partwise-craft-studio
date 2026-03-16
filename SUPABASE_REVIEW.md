# Supabase Connection Review

## Fixed Issues

### 1. Hardcoded credentials in `client.ts` (Critical)
**File:** `src/integrations/supabase/client.ts`

The Supabase URL and anon key were hardcoded as string literals in the source file. The `.env` file already contained the correct `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` variables, but they were never used.

**Fix applied:** Updated `client.ts` to read from `import.meta.env.VITE_SUPABASE_URL` and `import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY`, and added a startup error if either is missing.

---

### 2. `.env` not in `.gitignore` (Critical)
**File:** `.gitignore`

The `.env` file was not listed in `.gitignore`, meaning it could be committed to version control and expose credentials.

**Fix applied:** Added `.env` and `.env.*` (with `!.env.example` exception) to `.gitignore`.

---

## Flagged Issues (Require Manual Action)

### 3. `supabase.auth.admin.createUser()` called from the browser client (Critical)
**File:** `src/components/AdminPanel.tsx` line 86

```ts
const { data, error } = await supabase.auth.admin.createUser({ ... });
```

The Supabase Admin API (`auth.admin.*`) requires the **service role key**, not the anon/publishable key. Calling this from the browser with the anon key will fail with an authorization error at runtime.

**Recommended fix:** Move user creation to a Supabase Edge Function that runs server-side with the service role key, and call that function from the client. Never expose the service role key to the browser.

---

### 4. Race condition in `AuthGuard.tsx` (Medium)
**File:** `src/components/AuthGuard.tsx`

Both `onAuthStateChange` and `getSession()` are set up in the same `useEffect`, and both can call `setLoading(false)` and `navigate('/auth')`. On initial mount, `getSession()` may resolve and trigger navigation before the auth state change listener has been registered, or vice versa, causing a double-navigation or a brief flash of the loading spinner.

**Recommended fix:** Rely on one mechanism only — use `onAuthStateChange` (which fires immediately with the current session on subscription) and remove the separate `getSession()` call, or use a flag to ensure `navigate` is only called once.

---

### 5. `Layout.tsx` does not react to auth state changes (Medium)
**File:** `src/components/Layout.tsx`

`checkAdminStatus()` and `checkTeamLeadStatus()` are called once on mount with an empty dependency array. If the session expires or the user's role changes, the layout will show stale admin/team-lead state until a full page reload.

**Recommended fix:** Subscribe to `supabase.auth.onAuthStateChange` in the layout and re-run the checks when the session changes.

---

### 6. `supabase.auth.admin` usage also leaks `service_role` risk (High — by implication)
If the team ever switches the anon key in `client.ts` to the service role key (to "fix" issue #3), the entire client — accessible from the browser — would have unrestricted database access, bypassing Row Level Security. This must never happen.

---

### 7. `updateUserRole` accepts unconstrained role strings (Low)
**File:** `src/services/authService.ts` line 90

```ts
async updateUserRole(userId: string, role: string): Promise<boolean>
```

Any string can be passed as `role`. If the database column is a text column without a check constraint, invalid roles like `"superuser"` can be written silently.

**Recommended fix:** Either use a TypeScript union type (`'admin' | 'editor' | 'viewer'`) for the parameter, or add a `CHECK` constraint on the `role` column in the database.

---

### 8. `upsert` in `setUserPermission` missing `onConflict` (Low)
**File:** `src/services/authService.ts` line 131

```ts
await supabase.from('user_permissions').upsert({ ... });
```

Without specifying `onConflict`, the upsert behaviour depends on Supabase inferring the primary key. If the table has a composite unique constraint on `(user_id, document_id, section_id)`, this should be explicitly declared:

```ts
.upsert({ ... }, { onConflict: 'user_id,document_id,section_id' })
```

**Recommended fix:** Add the `onConflict` option to make the intent explicit and avoid silent insert failures if Supabase cannot determine the conflict column automatically.

---

## Summary

| # | Severity | Status | File |
|---|----------|--------|------|
| 1 | Critical | ✅ Fixed | `src/integrations/supabase/client.ts` |
| 2 | Critical | ✅ Fixed | `.gitignore` |
| 3 | Critical | ⚠️ Needs action | `src/components/AdminPanel.tsx:86` |
| 4 | Medium   | ⚠️ Needs action | `src/components/AuthGuard.tsx` |
| 5 | Medium   | ⚠️ Needs action | `src/components/Layout.tsx` |
| 6 | High     | ℹ️ Awareness | — |
| 7 | Low      | ⚠️ Needs action | `src/services/authService.ts:90` |
| 8 | Low      | ⚠️ Needs action | `src/services/authService.ts:131` |
