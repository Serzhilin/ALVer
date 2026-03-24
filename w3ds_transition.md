# W3DS / signature-validator — Transition Notes

## What signature-validator does

`signature-validator` is the eID authentication library used during login.
When a user scans the QR code with their eID wallet, the wallet signs a session
challenge. The server must verify that signature is genuine.

The library performs three steps, all orchestrated locally:

1. **Resolve** — calls `GET {PUBLIC_REGISTRY_URL}/resolve?w3id=<ename>` to find
   the user's eVault URL.
2. **Fetch key certificates** — calls `GET {evaultUrl}/whois` (with `X-ENAME`
   header) to retrieve JWTs containing the user's public key, signed by the
   registry.
3. **Verify** — downloads the registry's JWKS, verifies the JWTs, extracts the
   P-256 public key, and runs a local ECDSA signature check.

There is **no hosted `/verify` endpoint** — all cryptographic work runs inside
the ALVer API process.

## Why there is no hosted verify service

Checked the official W3DS docs at https://docs.w3ds.metastate.foundation.
The registry exposes only:
- `GET /resolve?w3id=...` — resolves an eName to an eVault URL
- `GET /.well-known/jwks.json` — registry public key set

The eVault exposes:
- `GET /whois` — key binding certificates for a user

No combined `/verify` endpoint exists. The library is the intended integration
point.

## How the dependency was restructured

**Before:** `api/package.json` referenced the library via a local file path:
```
"signature-validator": "file:../../metastate/prototype/infrastructure/signature-validator"
```
This path pointed outside the ALVer repository and made Docker builds impossible
without manual vendoring.

**Decision:** Inline the single source file into the ALVer repo.

**Rationale:**
- The library is one 460-line TypeScript file with no ALVer-specific logic
- It has no planned API surface changes that would require versioned updates
- Inlining eliminates the external path dependency entirely
- The Docker build becomes self-contained — no vendor step, no submodule

**What changed:**
- Source copied to `api/src/lib/signature-validator.ts`
- Import in `AuthController.ts` updated from `"signature-validator"` to
  `"../lib/signature-validator"`
- `api/package.json`: removed `file:` dep, added its three runtime dependencies
  directly — `axios ^1.6.7`, `jose ^5.2.0`, `multiformats 13.3.2`
- Dockerfile simplified — vendor/metastate path workaround removed entirely

## If the upstream library is updated

The canonical source is:
`metastate/prototype/infrastructure/signature-validator/src/index.ts`

To sync an update: copy the file again and run `npx tsc --noEmit` to catch any
breaking changes before committing.

## Runtime environment variables required

| Variable | Purpose |
|---|---|
| `PUBLIC_REGISTRY_URL` | W3DS registry base URL (`https://registry.w3ds.metastate.foundation`) |
| `PUBLIC_ALVER_BASE_URL` | Public URL of this server, used for eID wallet callbacks |
