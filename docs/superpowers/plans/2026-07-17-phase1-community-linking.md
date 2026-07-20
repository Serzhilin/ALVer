# Phase 1: Community Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace admin-only community provisioning with a self-serve W3DS linking flow where any community owner/admin can link their existing community to ALVer and becomes its first facilitator.

**Architecture:** ALVer resolves a W3ID via the W3DS Registry, reads the Chat envelope from the community's eVault to verify ownership, then creates a local Community row. The `createCommunity` admin endpoint and `createGroupEVault` call are removed entirely. Community mapping is updated to use the correct Chat ontology schemaId and is marked readOnly.

**Tech Stack:** TypeScript/Express API, TypeORM, React (JSX) frontend, W3DS Registry + eVault GraphQL.

## Global Constraints

- Community Chat ontology schemaId: `550e8400-e29b-41d4-a716-446655440003`
- W3DS Registry: `process.env.PUBLIC_REGISTRY_URL`
- eVault auth: `Authorization: Bearer <DEVELOPER_API_KEY>` + `X-ENAME: @<ename>`
- Ownership check: `payload.owner === userEname` OR `payload.admins.includes(userMetaEnvelopeId)`
- First linker = `facilitator_ename` on the Community row
- Never provision new eVaults — link only
- Per memory: never push to GitHub; commit locally only

---

## File Map

| File | Action | What changes |
|---|---|---|
| `api/src/lib/w3ds/ontology.ts` | **Create** | Community + User ontology UUID constants |
| `api/src/lib/evault.ts` | **Modify** | Add `findEnvelopesByOntology` + `getUserMetaEnvelopeId` |
| `api/src/services/CommunityService.ts` | **Modify** | Add `resolveW3id` + `linkCommunity` functions |
| `api/src/controllers/AdminController.ts` | **Modify** | Remove `createCommunity` function |
| `api/src/index.ts` | **Modify** | Add link routes, remove POST /api/admin/communities |
| `api/mappings/community.mapping.json` | **Modify** | Fix schemaId, add readOnly |
| `api/src/web3adapter/subscriber.ts` | **Modify** | Remove communities from outbound sync |
| `app/src/components/LinkCommunityWizard.jsx` | **Create** | 3-step linking wizard |
| `app/src/components/CommunityPicker.jsx` | **Modify** | Add "Link community" entry point |
| `app/src/views/AdminDashboard.jsx` | **Modify** | Remove community creation form |
| `app/src/api/client.js` | **Modify** | Add `resolveCommunity` + `linkCommunity` API calls |

---

### Task 1: Ontology constants + eVault helpers

**Files:**
- Create: `api/src/lib/w3ds/ontology.ts`
- Modify: `api/src/lib/evault.ts`

**Interfaces:**
- Produces:
  - `ONTOLOGIES.Community`, `ONTOLOGIES.User` — string constants
  - `findEnvelopesByOntology(vaultEname: string, ontology: string, limit?: number): Promise<Array<{ id: string; parsed: Record<string, unknown> | null }>>`
  - `getUserMetaEnvelopeId(ename: string): Promise<string | null>`

- [ ] **Step 1: Create `api/src/lib/w3ds/ontology.ts`**

```typescript
export const ONTOLOGIES = {
    User:      '550e8400-e29b-41d4-a716-446655440000',
    Community: '550e8400-e29b-41d4-a716-446655440003',
    Meeting:   '880e8400-e29b-41d4-a716-446655440099',
    Poll:      '660e8400-e29b-41d4-a716-446655440100',
    Vote:      '660e8400-e29b-41d4-a716-446655440101',
} as const;

export type OntologyId = typeof ONTOLOGIES[keyof typeof ONTOLOGIES];
```

- [ ] **Step 2: Add helpers to `api/src/lib/evault.ts`**

Append to the end of the existing file (do NOT remove `fetchEVaultProfile`):

```typescript
const GQL_FIND_BY_ONTOLOGY = `
  query FindByOntology($ontologyId: ID!, $first: Int, $after: String) {
    metaEnvelopes(filter: { ontologyId: $ontologyId }, first: $first, after: $after) {
      edges { node { id ontology parsed } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

/** Fetch all MetaEnvelopes of a given ontology from a vault. Paginates automatically. */
export async function findEnvelopesByOntology(
    vaultEname: string,
    ontology: string,
    limit = 100
): Promise<Array<{ id: string; parsed: Record<string, unknown> | null }>> {
    const registryUrl = process.env.PUBLIC_REGISTRY_URL;
    const developerApiKey = process.env.DEVELOPER_API_KEY ?? "";
    if (!registryUrl) return [];

    const normalizedEname = vaultEname.startsWith("@") ? vaultEname : `@${vaultEname}`;
    try {
        const resolveRes = await fetch(`${registryUrl}/resolve?w3id=${encodeURIComponent(normalizedEname)}`);
        if (!resolveRes.ok) return [];
        const { uri } = await resolveRes.json() as { uri: string };
        const endpoint = new URL("/graphql", uri).toString();

        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "X-ENAME": normalizedEname,
        };
        if (developerApiKey) headers["Authorization"] = `Bearer ${developerApiKey}`;

        const results: Array<{ id: string; parsed: Record<string, unknown> | null }> = [];
        let after: string | null = null;

        for (let page = 0; page < 20; page++) {
            const res = await fetch(endpoint, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    query: GQL_FIND_BY_ONTOLOGY,
                    variables: { ontologyId: ontology, first: limit, after },
                }),
            });
            if (!res.ok) break;
            const body = await res.json() as any;
            const edges: any[] = body?.data?.metaEnvelopes?.edges ?? [];
            for (const edge of edges) {
                results.push({ id: edge.node.id, parsed: edge.node.parsed ?? null });
            }
            const pageInfo = body?.data?.metaEnvelopes?.pageInfo;
            if (!pageInfo?.hasNextPage) break;
            after = pageInfo.endCursor;
        }
        return results;
    } catch {
        return [];
    }
}

/** Resolve eName → MetaEnvelope ID of the User profile envelope. */
export async function getUserMetaEnvelopeId(ename: string): Promise<string | null> {
    const { ONTOLOGIES } = await import("./w3ds/ontology");
    try {
        const envelopes = await findEnvelopesByOntology(ename, ONTOLOGIES.User, 1);
        return envelopes[0]?.id ?? null;
    } catch {
        return null;
    }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/serzhilin/Projects/ALVer/api && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors on new files.

- [ ] **Step 4: Commit**

```bash
cd /home/serzhilin/Projects/ALVer
git add api/src/lib/w3ds/ontology.ts api/src/lib/evault.ts
git commit -m "feat: add W3DS ontology constants and eVault helper functions

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Community linking service

**Files:**
- Modify: `api/src/services/CommunityService.ts`

**Interfaces:**
- Consumes: `findEnvelopesByOntology`, `getUserMetaEnvelopeId` from `api/src/lib/evault.ts`
- Produces:
  - `resolveW3id(w3id: string, userEname: string): Promise<W3idResolution>` — throws string error codes
  - `linkCommunity(input: { w3id: string; slug: string }, userEname: string): Promise<Community>`

- [ ] **Step 1: Add types and imports to `api/src/services/CommunityService.ts`**

At the top of the file, add imports:
```typescript
import { findEnvelopesByOntology, getUserMetaEnvelopeId } from "../lib/evault";
import { ONTOLOGIES } from "../lib/w3ds/ontology";
import { AppDataSource } from "../database/data-source";
import { Community } from "../database/entities/Community";
```

Add the W3idResolution type (before the first function):
```typescript
export type W3idResolution = {
    evault_uri: string;
    w3id: string;
    envelopeId: string;
    envelope: {
        name: string;
        logo_url: string | null;
        description: string | null;
    };
};
```

- [ ] **Step 2: Add `resolveW3id` to CommunityService.ts**

Append after the type definition:

```typescript
/**
 * Resolve a W3ID and verify the caller owns or admins the community.
 * Throws string error codes: 'w3id_not_found' | 'group_not_found' | 'not_admin'
 */
export async function resolveW3id(w3id: string, userEname: string): Promise<W3idResolution> {
    const registryUrl = process.env.PUBLIC_REGISTRY_URL;
    if (!registryUrl) throw new Error('w3id_not_found');

    // Normalize
    const normalizedW3id = w3id.startsWith('@') ? w3id : `@${w3id}`;

    // Resolve W3ID → eVault URI
    const resolveRes = await fetch(`${registryUrl}/resolve?w3id=${encodeURIComponent(normalizedW3id)}`);
    if (!resolveRes.ok) throw new Error('w3id_not_found');
    const { uri: evault_uri } = await resolveRes.json() as { uri: string };

    // Fetch Chat envelopes from community eVault
    const envelopes = await findEnvelopesByOntology(normalizedW3id, ONTOLOGIES.Community, 1);
    if (envelopes.length === 0) throw new Error('group_not_found');

    const envelope = envelopes[0];
    const payload = envelope.parsed ?? {};

    // Verify caller is owner or admin
    const normalizedUserEname = userEname.startsWith('@') ? userEname : `@${userEname}`;
    const owner = (payload.owner as string | undefined) ?? '';
    const admins: string[] = Array.isArray(payload.admins) ? payload.admins : [];

    const isOwner = owner === normalizedUserEname || owner === userEname;
    let isAdmin = false;
    if (!isOwner) {
        const userMetaId = await getUserMetaEnvelopeId(normalizedUserEname);
        isAdmin = userMetaId !== null && admins.includes(userMetaId);
    }

    if (!isOwner && !isAdmin) throw new Error('not_admin');

    return {
        evault_uri,
        w3id: normalizedW3id,
        envelopeId: envelope.id,
        envelope: {
            name: (payload.name as string | undefined) ?? normalizedW3id,
            logo_url: (payload.avatar as string | undefined) ?? null,
            description: (payload.description as string | undefined) ?? null,
        },
    };
}

/**
 * Link a W3DS community to ALVer. First linker becomes facilitator.
 * Throws string error codes: 'w3id_already_linked' | 'slug_taken' | + resolveW3id errors
 */
export async function linkCommunity(
    input: { w3id: string; slug: string },
    userEname: string
): Promise<Community> {
    const resolution = await resolveW3id(input.w3id, userEname);

    const repo = AppDataSource.getRepository(Community);

    // Check W3ID not already linked
    const existing = await repo.findOne({ where: { ename: resolution.w3id } });
    if (existing) throw new Error('w3id_already_linked');

    // Check slug not taken
    const slugConflict = await repo.findOne({ where: { slug: input.slug } });
    if (slugConflict) throw new Error('slug_taken');

    const community = repo.create({
        name: resolution.envelope.name,
        slug: input.slug,
        facilitator_ename: userEname.startsWith('@') ? userEname : `@${userEname}`,
        logo_url: resolution.envelope.logo_url ?? null,
        ename: resolution.w3id,
        evault_uri: resolution.evault_uri,
        locations: [],
    });

    return repo.save(community);
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd /home/serzhilin/Projects/ALVer/api && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /home/serzhilin/Projects/ALVer
git add api/src/services/CommunityService.ts
git commit -m "feat: add resolveW3id and linkCommunity to CommunityService

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: API routes + remove admin creation

**Files:**
- Modify: `api/src/controllers/AdminController.ts`
- Modify: `api/src/index.ts`

**Interfaces:**
- Produces: `GET /api/communities/resolve?w3id=@<uuid>` → `W3idResolution`
- Produces: `POST /api/communities/link` body `{ w3id: string; slug: string }` → `Community`
- Removes: `POST /api/admin/communities`

- [ ] **Step 1: Remove `createCommunity` from AdminController.ts**

In `api/src/controllers/AdminController.ts`:
- Remove the entire `createCommunity` function (lines 14–80 approximately).
- Remove the `import { createGroupEVault } from "web3-adapter";` import line.

Resulting file should only have `listCommunities` and `deleteCommunity`.

- [ ] **Step 2: Add linking handlers to `api/src/index.ts`**

At the top of `api/src/index.ts`, add import:
```typescript
import { resolveW3id, linkCommunity } from "./services/CommunityService";
```

Change the AdminController import line from:
```typescript
import { listCommunities, createCommunity, deleteCommunity } from "./controllers/AdminController";
```
to:
```typescript
import { listCommunities, deleteCommunity } from "./controllers/AdminController";
```

In the Admin routes section, remove:
```typescript
app.post("/api/admin/communities", requireAuth, requireAdmin, createCommunity);
```

In the Community routes section, add BEFORE the existing community routes:
```typescript
// ── Community linking (W3DS) ──────────────────────────────────────────────────
const W3ID_ERROR_STATUS: Record<string, number> = {
    w3id_not_found: 404,
    group_not_found: 404,
    not_admin: 403,
    w3id_already_linked: 409,
    slug_taken: 409,
    actor_has_no_ename: 400,
};

app.get("/api/communities/resolve", requireAuth, async (req, res) => {
    const w3id = req.query.w3id as string;
    if (!w3id) { res.status(400).json({ error: "w3id required" }); return; }
    const ename = req.user?.ename;
    if (!ename) { res.status(400).json({ error: "actor_has_no_ename" }); return; }
    try {
        const result = await resolveW3id(w3id, ename);
        res.json(result);
    } catch (err: any) {
        const status = W3ID_ERROR_STATUS[err.message] ?? 500;
        res.status(status).json({ error: err.message });
    }
});

app.post("/api/communities/link", requireAuth, async (req, res) => {
    const { w3id, slug } = req.body ?? {};
    if (!w3id || !slug) { res.status(400).json({ error: "w3id and slug required" }); return; }
    const ename = req.user?.ename;
    if (!ename) { res.status(400).json({ error: "actor_has_no_ename" }); return; }
    try {
        const community = await linkCommunity({ w3id, slug }, ename);
        res.status(201).json(community);
    } catch (err: any) {
        const status = W3ID_ERROR_STATUS[err.message] ?? 500;
        res.status(status).json({ error: err.message });
    }
});
```

- [ ] **Step 3: Update `.well-known/w3ds-platform.json` community schemaId**

In `api/src/index.ts`, find the `.well-known/w3ds-platform.json` handler. Change the GroupManifest entry:

Find:
```typescript
{
    name: "GroupManifest",
    schemaId: "a8bfb7cf-3200-4b25-9ea9-ee41100f212e",
    tableName: "communities",
    fields: { name: "name", eName: "ename", owner: "facilitator_ename", members: "members[].ename", admins: "members[is_facilitator].ename" },
},
```

Replace with:
```typescript
{
    name: "Community",
    schemaId: "550e8400-e29b-41d4-a716-446655440003",
    tableName: "communities",
    fields: { name: "name", eName: "ename", owner: "facilitator_ename", avatar: "logo_url" },
},
```

- [ ] **Step 4: TypeScript check**

```bash
cd /home/serzhilin/Projects/ALVer/api && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /home/serzhilin/Projects/ALVer
git add api/src/controllers/AdminController.ts api/src/index.ts
git commit -m "feat: add community link routes, remove admin community creation

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Fix community mapping + remove from outbound subscriber

**Files:**
- Modify: `api/mappings/community.mapping.json`
- Modify: `api/src/web3adapter/subscriber.ts`

**Interfaces:**
- Consumes: existing subscriber.ts patterns
- Produces: community mapping with correct schemaId + readOnly; subscriber no longer pushes community data

- [ ] **Step 1: Read current subscriber.ts**

```bash
cat /home/serzhilin/Projects/ALVer/api/src/web3adapter/subscriber.ts
```

Identify where communities are synced outbound (look for `community` in the subscriber or a mapping lookup that includes community.mapping.json).

- [ ] **Step 2: Update `api/mappings/community.mapping.json`**

Replace the file content with:
```json
{
  "tableName": "communities",
  "schemaId": "550e8400-e29b-41d4-a716-446655440003",
  "ownerEnamePath": "ename",
  "readOnly": true,
  "localToUniversalMap": {
    "name": "name",
    "ename": "eName",
    "facilitator_ename": "owner",
    "logo_url": "avatar",
    "created_at": "createdAt",
    "updated_at": "updatedAt"
  }
}
```

- [ ] **Step 3: Update subscriber.ts to skip community sync**

In `api/src/web3adapter/subscriber.ts`, find the section that handles `Community` or `communities` entities and remove it (or add a guard to skip if schemaId matches Community ontology).

The Web3Adapter respects `readOnly: true` in the mapping JSON — if the adapter already checks this flag, no subscriber change may be needed. Verify by checking the adapter code:

```bash
grep -n "readOnly\|read_only\|communities" /home/serzhilin/Projects/ALVer/api/src/web3adapter/subscriber.ts | head -20
grep -rn "readOnly" /home/serzhilin/Projects/ALVer/vendor/ 2>/dev/null | grep -i "readonly" | head -10
```

If the adapter does NOT check `readOnly`, add an explicit guard in subscriber.ts. Look for the communities trigger and remove it from any `PARENT_TRIGGER_MAP` or `AfterInsert`/`AfterUpdate` listeners.

- [ ] **Step 4: Commit**

```bash
cd /home/serzhilin/Projects/ALVer
git add api/mappings/community.mapping.json api/src/web3adapter/subscriber.ts
git commit -m "fix: community mapping schemaId → Chat ontology, mark readOnly

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Frontend linking wizard

**Files:**
- Create: `app/src/components/LinkCommunityWizard.jsx`
- Modify: `app/src/api/client.js`
- Modify: `app/src/components/CommunityPicker.jsx`
- Modify: `app/src/views/AdminDashboard.jsx`

**Interfaces:**
- Consumes: `GET /api/communities/resolve?w3id=`, `POST /api/communities/link`
- Props: `LinkCommunityWizard({ onLinked: (community) => void, onCancel: () => void })`

- [ ] **Step 1: Add API calls to `app/src/api/client.js`**

Find the file and append:
```javascript
export async function resolveCommunityW3id(w3id) {
  const token = localStorage.getItem('alver_token')
  const res = await fetch(`/api/communities/resolve?w3id=${encodeURIComponent(w3id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw Object.assign(new Error(body.error || `HTTP ${res.status}`), { status: res.status })
  }
  return res.json()
}

export async function linkCommunityW3id({ w3id, slug }) {
  const token = localStorage.getItem('alver_token')
  const res = await fetch('/api/communities/link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ w3id, slug }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw Object.assign(new Error(body.error || `HTTP ${res.status}`), { status: res.status })
  }
  return res.json()
}
```

- [ ] **Step 2: Create `app/src/components/LinkCommunityWizard.jsx`**

```jsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { resolveCommunityW3id, linkCommunityW3id } from '../api/client'

function toSlug(name) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

const ERROR_MESSAGES = {
  w3id_not_found: 'community_link.error_w3id_not_found',
  group_not_found: 'community_link.error_group_not_found',
  not_admin: 'community_link.error_not_admin',
  w3id_already_linked: 'community_link.error_already_linked',
  slug_taken: 'community_link.error_slug_taken',
}

export default function LinkCommunityWizard({ onLinked, onCancel }) {
  const { t } = useTranslation()
  const [step, setStep] = useState(1) // 1 = enter W3ID, 2 = review + slug, 3 = done
  const [w3id, setW3id] = useState('')
  const [resolution, setResolution] = useState(null)
  const [slug, setSlug] = useState('')
  const [slugManual, setSlugManual] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [linked, setLinked] = useState(null)

  async function handleResolve(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await resolveCommunityW3id(w3id.trim())
      setResolution(res)
      setSlug(toSlug(res.envelope.name))
      setSlugManual(false)
      setStep(2)
    } catch (err) {
      const key = ERROR_MESSAGES[err.message] ?? 'community_link.error_generic'
      setError(t(key, { defaultValue: err.message }))
    } finally {
      setLoading(false)
    }
  }

  async function handleLink(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const community = await linkCommunityW3id({ w3id: resolution.w3id, slug })
      setLinked(community)
      setStep(3)
    } catch (err) {
      const key = ERROR_MESSAGES[err.message] ?? 'community_link.error_generic'
      setError(t(key, { defaultValue: err.message }))
    } finally {
      setLoading(false)
    }
  }

  const containerStyle = {
    maxWidth: 440,
    margin: '0 auto',
    padding: 24,
    background: 'white',
    border: '1px solid var(--color-sand, #e8e0d5)',
  }

  if (step === 1) return (
    <div style={containerStyle}>
      <h2 style={{ fontFamily: 'var(--font-title)', fontSize: '1.3rem', marginBottom: 8 }}>
        {t('community_link.title', { defaultValue: 'Link community' })}
      </h2>
      <p style={{ fontSize: '0.9rem', color: '#888', marginBottom: 20 }}>
        {t('community_link.description', { defaultValue: 'Enter the W3DS identity of your community to link it.' })}
      </p>
      <form onSubmit={handleResolve}>
        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 6 }}>
          {t('community_link.w3id_label', { defaultValue: 'Community W3ID' })}
        </label>
        <input
          type="text"
          value={w3id}
          onChange={e => setW3id(e.target.value)}
          placeholder="@550e8400-e29b-41d4-a716-..."
          required
          style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--color-sand, #e8e0d5)', fontSize: '0.9rem', boxSizing: 'border-box', marginBottom: 8 }}
        />
        {error && <p style={{ color: '#c0392b', fontSize: '0.85rem', marginBottom: 8 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="submit" disabled={loading || !w3id.trim()} className="btn-primary" style={{ flex: 1 }}>
            {loading ? t('community_link.resolving', { defaultValue: 'Checking…' }) : t('community_link.resolve_btn', { defaultValue: 'Continue' })}
          </button>
          <button type="button" onClick={onCancel} className="btn-secondary">
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </button>
        </div>
      </form>
    </div>
  )

  if (step === 2) return (
    <div style={containerStyle}>
      <h2 style={{ fontFamily: 'var(--font-title)', fontSize: '1.3rem', marginBottom: 16 }}>
        {t('community_link.review_title', { defaultValue: 'Review community' })}
      </h2>
      {resolution.envelope.logo_url && (
        <img src={resolution.envelope.logo_url} alt="" style={{ width: 56, height: 56, objectFit: 'contain', marginBottom: 12 }} />
      )}
      <p style={{ fontWeight: 600, fontSize: '1rem', marginBottom: 4 }}>{resolution.envelope.name}</p>
      {resolution.envelope.description && (
        <p style={{ fontSize: '0.85rem', color: '#888', marginBottom: 16 }}>{resolution.envelope.description}</p>
      )}
      <form onSubmit={handleLink}>
        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 6 }}>
          {t('community_link.slug_label', { defaultValue: 'URL slug' })}
        </label>
        <input
          type="text"
          value={slug}
          onChange={e => { setSlugManual(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')) }}
          required
          style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--color-sand, #e8e0d5)', fontSize: '0.9rem', boxSizing: 'border-box', marginBottom: 8 }}
        />
        <p style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: 8 }}>
          {t('community_link.slug_hint', { defaultValue: 'Used in URLs. Letters, numbers, and hyphens only.' })}
        </p>
        {error && <p style={{ color: '#c0392b', fontSize: '0.85rem', marginBottom: 8 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="submit" disabled={loading || !slug} className="btn-primary" style={{ flex: 1 }}>
            {loading ? t('community_link.linking', { defaultValue: 'Linking…' }) : t('community_link.link_btn', { defaultValue: 'Link community' })}
          </button>
          <button type="button" onClick={() => setStep(1)} className="btn-secondary">
            {t('common.back', { defaultValue: 'Back' })}
          </button>
        </div>
      </form>
    </div>
  )

  if (step === 3) return (
    <div style={containerStyle}>
      <div style={{ fontSize: '2rem', marginBottom: 12 }}>✓</div>
      <h2 style={{ fontFamily: 'var(--font-title)', fontSize: '1.3rem', marginBottom: 8 }}>
        {t('community_link.success_title', { defaultValue: 'Community linked!' })}
      </h2>
      <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: 20 }}>
        {t('community_link.success_description', { defaultValue: 'You are now the first facilitator of this community in ALVer.' })}
      </p>
      <button className="btn-primary" style={{ width: '100%' }} onClick={() => onLinked(linked)}>
        {t('community_link.enter_btn', { defaultValue: 'Enter community' })}
      </button>
    </div>
  )

  return null
}
```

- [ ] **Step 3: Add i18n keys to `app/src/locales/en.json` and `nl.json`**

In `app/src/locales/en.json`, add under the root object:
```json
"community_link": {
  "title": "Link community",
  "description": "Enter the W3DS identity of your community.",
  "w3id_label": "Community W3ID",
  "resolve_btn": "Continue",
  "resolving": "Checking…",
  "review_title": "Review community",
  "slug_label": "URL slug",
  "slug_hint": "Used in URLs. Letters, numbers, and hyphens only.",
  "link_btn": "Link community",
  "linking": "Linking…",
  "success_title": "Community linked!",
  "success_description": "You are now the first facilitator of this community in ALVer.",
  "enter_btn": "Enter community",
  "error_w3id_not_found": "Community not found on W3DS network.",
  "error_group_not_found": "No community envelope found. Create it in Onboarding first.",
  "error_not_admin": "You are not an owner or admin of this community.",
  "error_already_linked": "This community is already linked to ALVer.",
  "error_slug_taken": "This slug is already taken. Choose another.",
  "error_generic": "Something went wrong. Try again."
}
```

In `app/src/locales/nl.json`, add equivalent Dutch translations (or copy English as fallback):
```json
"community_link": {
  "title": "Gemeenschap koppelen",
  "description": "Voer de W3DS-identiteit van je gemeenschap in.",
  "w3id_label": "Gemeenschap W3ID",
  "resolve_btn": "Doorgaan",
  "resolving": "Controleren…",
  "review_title": "Gemeenschap bekijken",
  "slug_label": "URL-slug",
  "slug_hint": "Gebruikt in URLs. Alleen letters, cijfers en koppeltekens.",
  "link_btn": "Gemeenschap koppelen",
  "linking": "Koppelen…",
  "success_title": "Gemeenschap gekoppeld!",
  "success_description": "Je bent nu de eerste facilitator van deze gemeenschap in ALVer.",
  "enter_btn": "Gemeenschap betreden",
  "error_w3id_not_found": "Gemeenschap niet gevonden op het W3DS-netwerk.",
  "error_group_not_found": "Geen gemeenschapsenvelop gevonden. Maak deze eerst aan in Onboarding.",
  "error_not_admin": "Je bent geen eigenaar of beheerder van deze gemeenschap.",
  "error_already_linked": "Deze gemeenschap is al gekoppeld aan ALVer.",
  "error_slug_taken": "Deze slug is al in gebruik. Kies een andere.",
  "error_generic": "Er is iets misgegaan. Probeer opnieuw."
}
```

- [ ] **Step 4: Update `CommunityPicker.jsx` to add link entry point**

In `app/src/components/CommunityPicker.jsx`:

1. Add import at top:
```jsx
import { useState } from 'react'
import LinkCommunityWizard from './LinkCommunityWizard'
```

2. Add state inside the component:
```jsx
const [showLinkWizard, setShowLinkWizard] = useState(false)
```

3. After the communities list (before the closing `</div>`), add:
```jsx
{!isFacilitatorSession && (
  <>
    <div style={{ height: 1, background: 'var(--color-sand, #e8e0d5)', margin: '20px 0', width: '100%', maxWidth: 420 }} />
    {showLinkWizard ? (
      <LinkCommunityWizard
        onLinked={(community) => { setShowLinkWizard(false); onSelect(community.id) }}
        onCancel={() => setShowLinkWizard(false)}
      />
    ) : (
      <button
        onClick={() => setShowLinkWizard(true)}
        style={{
          background: 'none',
          border: '2px dashed var(--color-sand, #e8e0d5)',
          padding: '12px 18px',
          width: '100%',
          maxWidth: 420,
          cursor: 'pointer',
          fontSize: '0.9rem',
          color: 'var(--color-muted, #888)',
          textAlign: 'center',
        }}
      >
        + {t('community_link.title')}
      </button>
    )}
  </>
)}
```

- [ ] **Step 5: Remove create form from AdminDashboard.jsx**

In `app/src/views/AdminDashboard.jsx`:
- Remove the create community form section (the `<form onSubmit={handleCreate}>` block and all its state/handlers: `form`, `setForm`, `slugManual`, `setSlugManual`, `formError`, `setFormError`, `submitting`, `setSubmitting`, `handleCreate`, `handleNameChange`, `handleSlugChange`, `handleLogoUpload`, `EMPTY_FORM`, `PRESET_COLORS`, `toSlug` function, `TITLE_FONTS` import)
- Remove `adminCreateCommunity` from the import statement in `app/src/api/client.js` import line
- Keep the list of communities and the delete functionality

- [ ] **Step 6: Commit**

```bash
cd /home/serzhilin/Projects/ALVer
git add app/src/components/LinkCommunityWizard.jsx \
        app/src/components/CommunityPicker.jsx \
        app/src/views/AdminDashboard.jsx \
        app/src/api/client.js \
        app/src/locales/en.json \
        app/src/locales/nl.json
git commit -m "feat: add community linking wizard UI, remove admin create form

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Smoke test

**Files:** none (read-only verification)

- [ ] **Step 1: Start dev environment**

```bash
cd /home/serzhilin/Projects/ALVer
docker compose up -d
cd api && npm run dev &
cd app && npm run dev &
```

Wait for API to log `"ALVer API started"`.

- [ ] **Step 2: Verify linking routes exist**

```bash
curl -s http://localhost:3001/api/communities/resolve?w3id=@test | jq .
# Expected: { "error": "actor_has_no_ename" } — not 404, proving route exists

curl -s -X POST http://localhost:3001/api/communities/link \
  -H "Content-Type: application/json" -d '{}' | jq .
# Expected: { "error": "actor_has_no_ename" } or { "error": "w3id and slug required" } — not 404
```

- [ ] **Step 3: Verify admin create endpoint gone**

```bash
curl -s -X POST http://localhost:3001/api/admin/communities \
  -H "Content-Type: application/json" -d '{"name":"x","slug":"x","facilitator_ename":"y"}' | jq .
# Expected: 401 (no auth token) — NOT 200 or 201 (route still works)
# Note: if it returns 403 or 404, that's also acceptable — just not 201
```

- [ ] **Step 4: Check TypeScript**

```bash
cd /home/serzhilin/Projects/ALVer/api && npx tsc --noEmit 2>&1
```

Expected: 0 errors.

- [ ] **Step 5: Final commit if any fixes needed**

```bash
cd /home/serzhilin/Projects/ALVer
git add -p  # stage only intentional changes
git commit -m "fix: smoke test corrections for phase 1

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
