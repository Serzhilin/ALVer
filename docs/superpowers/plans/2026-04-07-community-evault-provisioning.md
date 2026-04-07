# Community eVault Provisioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Creating a community via the Admin panel atomically provisions a group eVault in W3DS, so `community.ename` and `community.evault_uri` are always populated from the moment the community exists in ALVer.

**Architecture:** `AdminController.createCommunity` calls `createGroupEVault` from `web3-adapter` before saving the DB row. If provisioning fails, nothing is written to the DB and the error is returned to the frontend. The frontend blocks with a spinner during the operation and shows eVault status in the community list.

**Tech Stack:** TypeScript/Express (`api/src/controllers/AdminController.ts`), `createGroupEVault` from `web3-adapter` (vendored at `api/vendor/web3-adapter`), React (`app/src/views/AdminDashboard.jsx`).

---

## File Structure

- **Modify:** `api/src/controllers/AdminController.ts` — add eVault provisioning before DB save
- **Modify:** `app/src/views/AdminDashboard.jsx` — add spinner during submit, eVault status badge in list

---

### Task 1: Backend — provision eVault in createCommunity

**Context:**
- `createGroupEVault` is exported from `web3-adapter` (see `api/vendor/web3-adapter/dist/index.d.ts`)
- Signature: `createGroupEVault(registryUrl, provisionerUrl, { name, description, members, admins, owner }): Promise<{ w3id, uri, manifestId }>`
- `PUBLIC_REGISTRY_URL` and `PUBLIC_PROVISIONER_URL` come from `process.env`
- `community.ename` stores the group's w3id; `community.evault_uri` stores the eVault URI
- The existing `provision-communities.ts` script already uses this pattern — refer to `api/src/scripts/provision-communities.ts` for reference
- Current `createCommunity` is at `api/src/controllers/AdminController.ts:14-35`

**Files:**
- Modify: `api/src/controllers/AdminController.ts`

- [ ] **Step 1: Read the current file**

```bash
cat api/src/controllers/AdminController.ts
```

- [ ] **Step 2: Replace `createCommunity` with the provisioning version**

Replace the entire `createCommunity` function (lines 13–35) with:

```typescript
/** POST /api/admin/communities */
export async function createCommunity(req: Request, res: Response) {
    const { name, slug, facilitator_ename, primary_color, title_font, logo_url } = req.body;
    if (!name || !slug || !facilitator_ename) {
        res.status(400).json({ error: "name, slug and facilitator_ename are required" });
        return;
    }

    const registryUrl = process.env.PUBLIC_REGISTRY_URL;
    const provisionerUrl = process.env.PUBLIC_PROVISIONER_URL;
    if (!registryUrl || !provisionerUrl) {
        res.status(500).json({ error: "PUBLIC_REGISTRY_URL and PUBLIC_PROVISIONER_URL must be configured" });
        return;
    }

    const existing = await repo().findOne({ where: { slug } });
    if (existing) {
        res.status(409).json({ error: "Slug already taken" });
        return;
    }

    let evaultResult: { w3id: string; uri: string; manifestId: string };
    try {
        evaultResult = await createGroupEVault(registryUrl, provisionerUrl, {
            name,
            description: `${name} — cooperative meeting community`,
            members: [],
            admins: [],
            owner: facilitator_ename,
        });
    } catch (err: any) {
        console.error("[Admin] eVault provisioning failed:", err);
        res.status(502).json({ error: `eVault provisioning failed: ${err?.message ?? String(err)}` });
        return;
    }

    const community = repo().create({
        name,
        slug,
        facilitator_ename,
        primary_color: primary_color || "#C4622D",
        title_font: title_font || "Playfair Display",
        logo_url: logo_url || null,
        ename: evaultResult.w3id,
        evault_uri: evaultResult.uri,
        locations: [],
    });
    const saved = await repo().save(community);
    res.status(201).json(saved);
}
```

- [ ] **Step 3: Add `createGroupEVault` to the import at the top of the file**

The file currently starts with:
```typescript
import { Request, Response } from "express";
import { AppDataSource } from "../database/data-source";
import { Community } from "../database/entities/Community";
```

Change to:
```typescript
import { Request, Response } from "express";
import { createGroupEVault } from "web3-adapter";
import { AppDataSource } from "../database/data-source";
import { Community } from "../database/entities/Community";
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Manual smoke test**

With the API running (`npm run dev` from repo root or `api/` dir):

```bash
curl -s -X POST http://localhost:3001/api/admin/communities \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin_token>" \
  -d '{"name":"Test Provison","slug":"test-provision","facilitator_ename":"test@ename"}' \
  | jq '{id, name, ename, evault_uri}'
```

Expected: response contains non-null `ename` (a w3id string) and `evault_uri`.

If `PUBLIC_PROVISIONER_URL` is not set:
```bash
curl -s ... | jq .error
# Expected: "PUBLIC_REGISTRY_URL and PUBLIC_PROVISIONER_URL must be configured"
```

- [ ] **Step 6: Commit**

```bash
git add api/src/controllers/AdminController.ts
git commit -m "feat: provision group eVault atomically on community creation"
```

---

### Task 2: Frontend — spinner during create, eVault status in list

**Context:**
- File: `app/src/views/AdminDashboard.jsx`
- `submitting` state is already set to `true` during `handleCreate` and `false` after
- The Create button already shows `t('admin.creating')` while `submitting` is true
- `formError` state already displays inline errors below the form
- The community list renders each `c` from the `communities` array — each object includes `c.ename` (may be null for legacy communities)
- No external spinner library — implement inline with CSS animation

**Files:**
- Modify: `app/src/views/AdminDashboard.jsx`

- [ ] **Step 1: Add a CSS keyframe for the spinner**

At the bottom of `AdminDashboard.jsx`, after the `labelStyle` constant, add:

```jsx
const spinnerStyle = {
  display: 'inline-block',
  width: 14,
  height: 14,
  border: '2px solid rgba(255,255,255,0.4)',
  borderTopColor: 'white',
  borderRadius: '50%',
  animation: 'spin 0.7s linear infinite',
  marginRight: 6,
  verticalAlign: 'middle',
}
```

And inject the keyframe once via a `<style>` tag inside the component return. Add this just inside the outermost `<div>`:

```jsx
<style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
```

- [ ] **Step 2: Update the Create button to show spinner**

Find the current Create button:
```jsx
<button className="btn-primary" type="submit" disabled={submitting} style={{ alignSelf: 'flex-start' }}>
  {submitting ? t('admin.creating') : t('admin.create')}
</button>
```

Replace with:
```jsx
<button className="btn-primary" type="submit" disabled={submitting} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center' }}>
  {submitting && <span style={spinnerStyle} />}
  {submitting ? t('admin.creating') : t('admin.create')}
</button>
```

- [ ] **Step 3: Add eVault status badge to the community list**

Find the community list row subtitle line:
```jsx
<div style={{ fontSize: '0.78rem', color: 'var(--color-charcoal-light)', marginTop: 2 }}>
  /{c.slug}
</div>
```

Replace with:
```jsx
<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
  <span style={{ fontSize: '0.78rem', color: 'var(--color-charcoal-light)' }}>
    /{c.slug}
  </span>
  {c.ename
    ? <span style={{ fontSize: '0.7rem', color: 'var(--color-charcoal-light)', fontFamily: 'monospace', background: 'var(--color-sand)', padding: '1px 6px', borderRadius: 4 }}>
        w3id: {c.ename.slice(0, 8)}…
      </span>
    : <span style={{ fontSize: '0.7rem', color: '#b45309', background: '#fef3c7', padding: '1px 6px', borderRadius: 4 }}>
        ⚠ No eVault
      </span>
  }
</div>
```

- [ ] **Step 4: Manual verification**

Start the app (`npm run dev` from repo root). Open `/admin-dashboard`.

1. Create a new community — the button should show a spinner + "Creating…" for 2–4 seconds while provisioning runs.
2. On success — new community appears in the list with a `w3id: xxxxxxxx…` badge.
3. Any legacy communities without `ename` show `⚠ No eVault`.
4. If the API returns an error (e.g. provisioner down) — error text appears below the form.

- [ ] **Step 5: Commit**

```bash
git add app/src/views/AdminDashboard.jsx
git commit -m "feat: show spinner during community creation, eVault status badge in list"
```
