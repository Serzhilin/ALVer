# ALVer — TODO

## Community bootstrap (no UI yet)

The first community and its admin must be created manually via a DB insert.
There is no self-service onboarding flow.

**What needs to exist before a new community can use the app:**

1. A row in the `community` table with `facilitator_ename` set to the admin's eID ename.
2. The admin's ename must match exactly what the eID wallet sends in `POST /api/auth/login`.

**Minimal SQL to bootstrap:**

```sql
INSERT INTO community (id, name, facilitator_ename)
VALUES (gen_random_uuid(), 'De Groene Stad', '@your-eid-ename-here');
```

**Future work:** build a self-service onboarding flow (community creation form, initial admin claim) so new cooperatives can sign up without manual DB access.
