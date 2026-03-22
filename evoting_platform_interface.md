# Evoting Platform — UI & Feature Overview

**Location:** `~/Projects/metastate/prototype/platforms/evoting`
**Stack:** Next.js (React) frontend + Node.js API + PostgreSQL + W3DS eID Wallet integration

---

## Authentication
- Login via **eID Wallet**: QR code scan (desktop) or deep link (mobile)
- Auto-login via deeplink params (ename, session, signature)

---

## Home / Poll List
- Search, sort, paginate all polls
- Each poll shows: title, mode, visibility, weight, status, deadline
- Create New Poll button

---

## Create Poll
Fields:
- Question (title)
- Group (only chartered groups allowed)
- Deadline (datetime or manual)
- **Visibility**: Public (voters shown) | Private/Blind (voters hidden)
- **Vote type**:
  - Simple — pick one option
  - Points-based — distribute 100 points
  - Ranked choice — rank top 3
- **Voting weight**: 1P1V | eReputation-weighted
- Options: dynamic list, min 2

### Incompatibility constraints
| Setting | Incompatible with |
|---|---|
| Ranked choice | eReputation, blind voting (warning) |
| eReputation | Private/Blind, Ranked choice |
| Points-based + Private | Warning (not cryptographically protected) |

---

## Poll Detail / Voting Page

### Casting a vote
- Interface adapts to mode: radio buttons / sliders / rank dropdowns
- Private votes use **eID Wallet signing** (QR or deep link, 15-min window)

### Delegation (group polls, non-blind only)
- Delegate your vote to another group member
- Accept or reject incoming delegations
- Vote on behalf of delegators (switch context via dropdown)

### Creator controls
- Manually **Start** or **End** the poll (when no deadline set)

### Results (after poll ends)
- Bar charts, vote counts, percentages, turnout
- Blind polls: cryptographic blind tally
- Winner highlighted; ties shown with badge
- eReputation mode: shows point totals and eligible points

---

## Key File Paths
- Pages: `client/src/app/`
- Components: `client/src/components/`
- API client: `client/src/lib/pollApi.ts`
- Navigation: `client/src/components/navigation.tsx`
