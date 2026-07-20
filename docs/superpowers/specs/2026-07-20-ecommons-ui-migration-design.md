# ALVer → @ecommons/ui Migration Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Strip ALVer's Tailwind + bespoke inline styles; replace all UI elements with `@ecommons/ui` components and CSS Modules referencing design tokens — matching CORE's pattern exactly so all ecommons apps look and behave consistently.

---

## Principles

- **ecommons-ui for all UI elements:** Button, Input, Select, Modal, Card, Panel, Badge, Loading, Heading, Label, SectionLabel, ErrorText, Avatar, MenuItem — nothing custom where a component exists.
- **CSS Modules for layout:** Static padding/margin/gap/display go in `Foo.module.css` using `var(--space-*)`, `var(--color-*)`, `var(--font-*)` tokens. One `.module.css` per migrated file.
- **Inline `style={{}}` only for runtime-dynamic values:** a workgroup color, a vote percentage width, any value computed from data at render time. Never for static layout.
- **No Tailwind:** remove it entirely. No utility classes of any kind.
- **Skip non-UI files:** `charts/`, `AgendaHtml.jsx`, `RichTextEditor.jsx` — SVG/canvas/TipTap, no migration needed.

---

## Package changes

**Remove from `devDependencies`:** `tailwindcss`, `autoprefixer`, `postcss`

**Delete files:** `tailwind.config.js`, `postcss.config.js`

**Add to `dependencies`:**
```json
"@ecommons/ui": "github:Serzhilin/ecommons-ui"
```

`vite.config.js` already has `resolve.dedupe: ['react', 'react-dom']` — keep it.

---

## `index.css` after migration

Keep only:
1. `@import '@ecommons/ui/dist/index.css';` — tokens + base styles
2. Animation keyframes: `slideIn`, `fadeIn`, `scaleIn`, `pulse-soft`, `greetingFlash`, `revealResult` and their `.animate-*` / `.greeting-flash` / `.reveal-result` classes — no ecommons-ui equivalent
3. `.divider` — used in modals
4. `.upcoming-row-btn` + hover/mobile media query — row action buttons in Home
5. `.agenda-html` prose styles — rendered HTML from TipTap
6. `.tiptap` prose styles — live editor
7. `label { display:block; font-size:… }` global label override — keep until every label replaced with `<Label>` from ecommons-ui, then remove

Remove: `@tailwind base;`, `@tailwind components;`, `@tailwind utilities;` and all `badge-*` class definitions.

---

## Component substitution reference

| Replace | With |
|---|---|
| `<button className="...">` | `<Button variant="primary|secondary|danger|green">` |
| `<input …>` / `<textarea …>` | `<Input>` |
| `<select …>` | `<Select>` |
| Modal overlay `<div>` | `<Modal onOverlayClick={fn}>` — no title prop; put header as first child |
| Card container `<div>` | `<Card>` |
| Dropdown panel `<div>` | `<Panel>` |
| Status/label badge `<span>` | `<Badge variant="…">` |
| Spinner / skeleton | `<Loading>` |
| `<h1>`–`<h3>` | `<Heading level={1|2|3}>` |
| `<label>` | `<Label>` |
| Section header text | `<SectionLabel>` |
| Error message `<span>/<p>` | `<ErrorText>` |
| `Avatar`, `MenuItem` | already in use — keep |

For Page-level layout wrappers check if `<Page>` from ecommons-ui fits before writing a custom CSS Module class.

---

## File-by-file scope

### T1 — Config strip
- `app/package.json` — remove tailwind/postcss devDeps, add `@ecommons/ui`
- `app/tailwind.config.js` — delete
- `app/postcss.config.js` — delete
- `app/src/index.css` — strip @tailwind directives, keep list above

### T2 — Shell components
- `app/src/components/AppHeader.jsx` + `AppHeader.module.css` — partially migrated; clean up remaining static inline styles into module CSS
- `app/src/components/FacilitatorHeader.jsx` + `FacilitatorHeader.module.css`
- `app/src/components/LanguageSwitcher.jsx` + `LanguageSwitcher.module.css`
- `app/src/components/ErrorBoundary.jsx` + `ErrorBoundary.module.css`

### T3 — Modal components
- `app/src/components/MeetingFormModal.jsx` + `MeetingFormModal.module.css` — wrap in `<Modal>`, form fields → `<Input>` / `<Select>` / `<Label>`
- `app/src/components/MembersModal.jsx` + `MembersModal.module.css`
- `app/src/components/SettingsModal.jsx` + `SettingsModal.module.css`

### T4 — Flow components
- `app/src/components/LoginScreen.jsx` + `LoginScreen.module.css` — QR + eID login flow
- `app/src/components/CommunityPicker.jsx` + `CommunityPicker.module.css`
- `app/src/components/LinkCommunityWizard.jsx` + `LinkCommunityWizard.module.css`

### T5 — Simple views
- `app/src/views/AdminLogin.jsx` + `AdminLogin.module.css`
- `app/src/views/FacilitatorLogin.jsx` + `FacilitatorLogin.module.css`
- `app/src/views/DeeplinkLogin.jsx` + `DeeplinkLogin.module.css`
- `app/src/views/Register.jsx` + `Register.module.css`
- `app/src/views/Aanmelden.jsx` + `Aanmelden.module.css`

### T6 — Home view
- `app/src/views/Home.jsx` + `Home.module.css` — meeting list, status badges, mandate flows, CommunityPicker integration

### T7 — Attend + Archive + Minutes
- `app/src/views/Attend.jsx` + `Attend.module.css`
- `app/src/views/Archive.jsx` + `Archive.module.css`
- `app/src/views/MinutesEditor.jsx` + `MinutesEditor.module.css`

### T8 — Facilitate view
- `app/src/views/Facilitate.jsx` + `Facilitate.module.css` — ~1000 lines; real-time poll flow, vote result reveal, phase transitions. Largest file in the app.

### T9 — Display view
- `app/src/views/Display.jsx` + `Display.module.css` — big-screen projector view; isolated from auth/data flows

### Skip (no migration)
- `app/src/components/charts/VoteBar.jsx` — SVG chart
- `app/src/components/charts/VotePie.jsx` — SVG chart
- `app/src/components/charts/VoteBubbles.jsx` — canvas/SVG
- `app/src/components/charts/chartUtils.js` — pure JS
- `app/src/components/AgendaHtml.jsx` — HTML renderer (prose CSS stays in index.css)
- `app/src/components/RichTextEditor.jsx` — TipTap wrapper

---

## CSS Module conventions

- Class names: camelCase (`styles.meetingRow`, `styles.headerLeft`)
- Only static values in `.module.css`; dynamic values in `style={{}}`
- Always reference token vars, never hardcode pixel values that exist in the token scale
- Allowed to add a `:root`-level CSS var in `index.css` if a token is missing, but prefer existing `--space-*` / `--color-*` values first

---

## Definition of done

- `npm run build` in `app/` succeeds with zero errors
- `tailwindcss` not in any import or config
- No `className="..."` strings containing Tailwind utility classes
- No static layout values in inline `style={{}}` (padding, margin, gap, display, flex-direction, background for non-dynamic values)
- Every button, input, select, modal, card, panel, badge, spinner, heading, label uses an ecommons-ui component
- App renders and all routes function: Home, Facilitate, Attend, Display, Archive, Admin, Login flows
