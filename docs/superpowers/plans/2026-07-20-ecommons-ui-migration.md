# ALVer → @ecommons/ui Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip ALVer's Tailwind utilities and bespoke inline styles; replace all UI elements with `@ecommons/ui` components and CSS Modules so the app matches CORE's pattern and all ecommons apps look consistent.

**Architecture:** Every interactive UI element (button, input, modal, card, badge, etc.) is replaced with the matching `@ecommons/ui` component. Static layout (padding, gap, display, flex) moves to sibling `.module.css` files referencing design token CSS vars. Inline `style={{}}` is kept **only** for runtime-dynamic values (a workgroup color from DB, a vote percentage width). Tailwind and postcss are removed entirely.

**Tech Stack:** React 19, Vite 8, `@ecommons/ui` (github:Serzhilin/ecommons-ui), CSS Modules (Vite zero-config), CSS custom properties

## Global Constraints

- `@ecommons/ui` is already resolvable in the workspace (`vite.config.js` has `resolve.dedupe: ['react','react-dom']`). Task 1 adds it to `package.json` as an explicit dep.
- CSS Module class names: **camelCase** (`styles.meetingRow`, `styles.headerLeft`)
- **Only runtime-dynamic values** in `style={{}}` — e.g. `style={{ background: wg.color }}` where `wg.color` comes from API data
- **Never** hardcode pixel values that exist in the token scale in module CSS — always use `var(--space-*)` or `var(--color-*)`
- `npm run build` inside `app/` must succeed with zero errors after every task commit
- Do NOT modify: `charts/VoteBar.jsx`, `charts/VotePie.jsx`, `charts/VoteBubbles.jsx`, `charts/chartUtils.js`, `AgendaHtml.jsx`, `RichTextEditor.jsx`

## ecommons-ui Component API Quick Reference

All imported from `'@ecommons/ui'`:

```tsx
// Button — wraps <button>, spreads all button HTML attrs
<Button variant="primary|secondary|danger|green" onClick={…}>Label</Button>

// Input / Textarea — wraps <input>/<textarea>, spreads all attrs
<Input type="text" value={v} onChange={…} placeholder="…" />
<Textarea value={v} onChange={…} />

// Select — wraps <select>, spreads all attrs
<Select value={v} onChange={…}><option>…</option></Select>

// Modal — overlay + centered box; no built-in title/close button
<Modal onOverlayClick={onClose}>
  {/* header, body, footer as children */}
</Modal>

// Card — styled div; use style/className for extra layout
<Card style={{ borderTop: `3px solid ${wg.color}` }}>…</Card>

// Panel — floating frame (dropdowns, popovers)
<Panel shadow="default|sm" style={{ position:'absolute', … }}>…</Panel>

// Badge — inline status chip
<Badge variant="orange|green|red|gray|blue|plain">…</Badge>
<Badge color={wg.color}>…</Badge>  // dynamic color

// Avatar — circular avatar with fallback initial
<Avatar src={url} size={51} background="var(--color-terracotta)" fontSize="1.3rem" fontWeight={600}>{initial}</Avatar>

// MenuItem — clickable row for Panel dropdowns
<MenuItem onClick={…} danger>Log out</MenuItem>

// SectionLabel — small caps section header
<SectionLabel>Members</SectionLabel>

// Label — form label
<Label htmlFor="fieldId" size="sm|md">Field label</Label>

// Heading — title text using --font-title
<Heading as="h1|span" fontSize="1.3rem" fontWeight={700}>Title</Heading>

// Loading — muted text placeholder
<Loading style={{ padding: 'var(--space-24)' }}>Loading…</Loading>

// ErrorText — red error message
<ErrorText as="p">Something went wrong</ErrorText>

// Page — centered max-width wrapper
<Page maxWidth={480} style={{ padding: 'var(--space-24)' }}>…</Page>
```

## Substitution Rules (apply to every file)

| Current | Replace with |
|---|---|
| `<button className="btn-primary">` | `<Button variant="primary">` |
| `<button className="btn-secondary">` | `<Button variant="secondary">` |
| `<button className="btn-danger">` | `<Button variant="danger">` |
| `<button style={{background:'none',border:'none',cursor:'pointer',…}}>` | `<Button variant="secondary">` or keep as `<button>` if it's a purely iconic control with no text |
| `<input className="input">` | `<Input>` |
| `<textarea className="input">` | `<Textarea>` |
| `<select className="input">` | `<Select>` |
| `<div className="modal-overlay"><div className="modal">…` | `<Modal onOverlayClick={onClose}>…` |
| `<div className="card">` | `<Card>` |
| `<h1/h2/h3>` with `fontFamily:'var(--font-title)'` | `<Heading as="h1" fontSize="…">` |
| `<label>` | `<Label>` (except file-input-trigger labels — keep native) |
| Error `<p style={{color:'var(--color-red)'}}>` | `<ErrorText as="p">` |
| Loading skeleton divs / loading text spans | `<Loading>` |
| Status badge `<span className="badge-green">` etc. | `<Badge variant="green">` etc. |
| `<div style={{maxWidth:480,margin:'0 auto'}}>` | `<Page maxWidth={480}>` |
| Inline `SectionLabel` helper component in SettingsModal | `<SectionLabel>` from ecommons-ui |

Static `style={{display,gap,padding,flexDirection,…}}` → CSS Module class.

---

## Task 1: Config Strip + Dependency Wiring

**Files:**
- Modify: `app/package.json`
- Delete: `app/tailwind.config.js`, `app/postcss.config.js`
- Modify: `app/src/index.css`

**Interfaces:**
- Produces: `@ecommons/ui` properly declared as dep; Tailwind build tooling gone; `index.css` clean

- [ ] **Step 1: Add @ecommons/ui to package.json, remove Tailwind tooling**

Open `app/package.json`. Make these changes:

```json
{
  "dependencies": {
    "@ecommons/ui": "github:Serzhilin/ecommons-ui",
    "@tiptap/pm": "^3.20.4",
    "@tiptap/react": "^3.20.4",
    "@tiptap/starter-kit": "^3.20.4",
    "i18next": "^25.10.2",
    "mammoth": "^1.12.0",
    "qrcode": "^1.5.4",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "react-i18next": "^16.6.0",
    "react-router-dom": "^7.13.1"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.4",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.1",
    "eslint": "^9.39.4",
    "eslint-plugin-react-hooks": "^7.0.1",
    "eslint-plugin-react-refresh": "^0.5.2",
    "globals": "^17.4.0",
    "vite": "^8.0.1",
    "vite-plugin-pwa": "^1.2.0"
  }
}
```
(Removed: `tailwindcss`, `autoprefixer`, `postcss`)

- [ ] **Step 2: Delete Tailwind config files**

```bash
cd /home/serzhilin/Projects/ALVer/app
rm -f tailwind.config.js postcss.config.js
```

- [ ] **Step 3: Rewrite index.css — remove @tailwind directives, keep ALVer-specific styles**

Replace the entire content of `app/src/index.css` with:

```css
@import '@ecommons/ui/dist/index.css';

/* ── ALVer animation utilities ────────────────────────────────────────────── */
@keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes scaleIn { from { transform: scale(0.93); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes pulse-soft { 0%,100% { opacity: 1; } 50% { opacity: 0.65; } }
@keyframes greetingFlash {
  0% { opacity: 0; transform: scale(0.93); }
  8% { opacity: 1; transform: scale(1); }
  85% { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(1.03); }
}
@keyframes revealResult {
  0% { opacity: 0; transform: translateY(12px) scale(0.96); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
.animate-slide-in { animation: slideIn 0.35s ease forwards; }
.animate-fade-in { animation: fadeIn 0.4s ease forwards; }
.animate-scale-in { animation: scaleIn 0.3s ease forwards; }
.animate-pulse-soft { animation: pulse-soft 2s ease-in-out infinite; }
.greeting-flash { animation: greetingFlash 3s ease forwards; }
.reveal-result { animation: revealResult 0.55s ease forwards; }

.divider { border: none; border-top: 1px solid var(--color-sand); margin: var(--space-16) 0; }

/* ── Upcoming meeting row action buttons ──────────────────────────────────── */
.upcoming-row-btn {
  background: none;
  border: 1px solid transparent;
  border-radius: 0;
  cursor: pointer;
  font-size: 0.78rem;
  color: var(--color-charcoal-light);
  padding: 4px 8px;
  white-space: nowrap;
  opacity: 0.3;
  transition: opacity 0.15s, background 0.15s, border-color 0.15s;
}
@media (hover: hover) {
  .upcoming-row:hover .upcoming-row-btn { opacity: 1; }
  .upcoming-row-btn:hover { background: var(--color-sand); border-color: var(--color-sand-dark); }
}
@media (hover: none) {
  .upcoming-row-btn { opacity: 1; }
}

/* ── Agenda HTML (rendered output) ───────────────────────────────────────── */
.agenda-html { font-size: 0.88rem; color: var(--color-charcoal); line-height: 1.8; }
.agenda-html p { margin: 0 0 6px; }
.agenda-html p:last-child { margin-bottom: 0; }
.agenda-html ul, .agenda-html ol { padding-left: 20px; margin: 4px 0 8px; list-style-type: disc; }
.agenda-html ol { list-style-type: decimal; }
.agenda-html li { margin-bottom: 3px; }
.agenda-html blockquote { border-left: 3px solid var(--color-terracotta); margin: 8px 0; padding: 4px 12px; color: var(--color-charcoal-light); font-style: italic; }
.agenda-html hr { border: none; border-top: 1px solid var(--color-sand); margin: 10px 0; }
.agenda-html strong { font-weight: 600; }
.agenda-html s, .agenda-html del { text-decoration: line-through; }

/* ── TipTap editor prose ──────────────────────────────────────────────────── */
.tiptap { outline: none; }
.tiptap p { margin: 0 0 6px; }
.tiptap p:last-child { margin-bottom: 0; }
.tiptap ul, .tiptap ol { padding-left: 20px; margin: 4px 0 8px; list-style-type: disc; }
.tiptap ol { list-style-type: decimal; }
.tiptap li { margin-bottom: 3px; }
.tiptap blockquote { border-left: 3px solid var(--color-terracotta); margin: 8px 0; padding: 4px 12px; color: var(--color-charcoal-light); font-style: italic; }
.tiptap hr { border: none; border-top: 1px solid var(--color-sand); margin: 10px 0; }
.tiptap strong { font-weight: 600; }
.tiptap s, .tiptap del { text-decoration: line-through; }
```

- [ ] **Step 4: Verify build still compiles**

```bash
cd /home/serzhilin/Projects/ALVer/app && npm run build 2>&1 | tail -20
```

Expected: build succeeds. Tailwind-related warnings about missing classes are expected and will disappear as tasks complete.

- [ ] **Step 5: Commit**

```bash
cd /home/serzhilin/Projects/ALVer
git add app/package.json app/src/index.css
git rm --ignore-unmatch app/tailwind.config.js app/postcss.config.js
git commit -m "chore: remove Tailwind, add @ecommons/ui dep, clean index.css"
```

---

## Task 2: Shell Components (AppHeader, FacilitatorHeader, LanguageSwitcher, ErrorBoundary)

**Files:**
- Modify: `app/src/components/AppHeader.jsx`
- Create: `app/src/components/AppHeader.module.css`
- Modify: `app/src/components/FacilitatorHeader.jsx` (may need no changes — wraps AppHeader; check and add module css only if it has layout styles)
- Modify: `app/src/components/LanguageSwitcher.jsx`
- Create: `app/src/components/LanguageSwitcher.module.css`
- Modify: `app/src/components/ErrorBoundary.jsx`
- Create: `app/src/components/ErrorBoundary.module.css`

**Interfaces:**
- Consumes: `Avatar, Panel, MenuItem` from `@ecommons/ui` (already imported in AppHeader)
- Produces: AppHeader with zero static inline styles; all layout in AppHeader.module.css

- [ ] **Step 1: Read current AppHeader.jsx, FacilitatorHeader.jsx, LanguageSwitcher.jsx, ErrorBoundary.jsx**

Read all four files to understand what static styles exist.

- [ ] **Step 2: Create AppHeader.module.css**

```css
/* app/src/components/AppHeader.module.css */
.header {
  background: white;
  padding: 0 var(--space-32);
  position: sticky;
  top: 0;
  z-index: 200;
}
.inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 76px;
}
.left {
  display: flex;
  align-items: center;
  gap: var(--space-10);
  min-width: 0;
}
.appLink {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  text-decoration: none;
}
.forLabel {
  font-size: 0.85rem;
  color: var(--color-charcoal-light);
  flex-shrink: 0;
}
.dot {
  color: var(--color-charcoal-light);
  font-size: 0.85rem;
  flex-shrink: 0;
}
.titleRow {
  display: flex;
  align-items: center;
  gap: 7px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.liveDot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-green);
  display: inline-block;
  flex-shrink: 0;
}
.right {
  display: flex;
  align-items: center;
  gap: var(--space-10);
  flex-shrink: 0;
}
.menuWrap {
  position: relative;
}
.avatarBtn {
  border: none;
  cursor: pointer;
  padding: 0;
  background: none;
  flex-shrink: 0;
}
.dropdown {
  position: absolute;
  top: 58px;
  right: 0;
  z-index: 1000;
  background: white;
  min-width: 200px;
  overflow: hidden;
}
.dropdownUser {
  padding: var(--space-10) var(--space-16);
  border-bottom: 1px solid var(--color-sand);
  font-weight: 600;
  font-size: 0.88rem;
  color: var(--color-charcoal);
}
.dropdownFooter {
  border-top: 1px solid var(--color-sand);
}
```

- [ ] **Step 3: Rewrite AppHeader.jsx using CSS Modules**

Read the current file first. The rewrite replaces every static `style={{...}}` with `styles.className` refs while keeping dynamic values inline. Key changes:

```jsx
import styles from './AppHeader.module.css'
// ... existing imports kept ...

export default function AppHeader({ logo, title, liveIndicator = false, user, isFacilitator = false, onSettings, onMembers, onLogout, onSwitchCommunity, right }) {
  // ... state and handlers unchanged ...

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <div className={styles.left}>
          <Link to="/" className={styles.appLink}>
            <AppLogo />
          </Link>
          {hasCommunity && <span className={styles.forLabel}>for</span>}
          {logo && <CommunityLogo src={logo} />}
          {title && (
            <>
              {logo && <span className={styles.dot}>·</span>}
              <span className={styles.titleRow} style={{ fontFamily: logo ? 'var(--font-sans)' : 'var(--font-title)', fontWeight: logo ? 400 : 700, fontSize: '1.05rem', color: 'var(--color-charcoal)' }}>
                {liveIndicator && <span className={`${styles.liveDot} animate-pulse-soft`} />}
                {title}
              </span>
            </>
          )}
        </div>
        <div className={styles.right}>
          {right}
          {user ? (
            <div ref={menuRef} className={styles.menuWrap}>
              <button className={styles.avatarBtn} onClick={() => setShowMenu(v => !v)} title={user.displayName}>
                <Avatar src={user.avatarUrl} size={51} background={isFacilitator ? 'var(--color-terracotta)' : 'var(--color-sand-dark)'} fontSize="1.3rem" fontWeight={600}>
                  {initial}
                </Avatar>
              </button>
              {showMenu && (
                <Panel className={styles.dropdown}>
                  <div className={styles.dropdownUser}>{user.displayName}</div>
                  {onSwitchCommunity && <MenuItem onClick={() => { onSwitchCommunity(); setShowMenu(false) }}>{t('community_picker.switch_btn')}</MenuItem>}
                  {isFacilitator && onMembers && <MenuItem onClick={() => { onMembers(); setShowMenu(false) }}>{t('settings.members_label')}</MenuItem>}
                  {isFacilitator && onSettings && <MenuItem onClick={() => { onSettings(); setShowMenu(false) }}>{t('settings.title')}</MenuItem>}
                  <MenuItem onClick={() => { i18n.changeLanguage(i18n.language === 'nl' ? 'en' : 'nl'); setShowMenu(false) }}>{i18n.language === 'nl' ? 'EN' : 'NL'}</MenuItem>
                  {onLogout && <div className={styles.dropdownFooter}><MenuItem onClick={() => { onLogout(); setShowMenu(false) }} danger>{t('home.logout')}</MenuItem></div>}
                </Panel>
              )}
            </div>
          ) : (
            <LanguageSwitcher />
          )}
        </div>
      </div>
    </header>
  )
}
```

- [ ] **Step 4: Read and migrate LanguageSwitcher.jsx + ErrorBoundary.jsx**

Read both files. Move any static `style={{}}` to `.module.css` files. Replace `<button>` with `<Button variant="secondary">` if it's a visible button.

- [ ] **Step 5: Verify build**

```bash
cd /home/serzhilin/Projects/ALVer/app && npm run build 2>&1 | tail -10
```

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
cd /home/serzhilin/Projects/ALVer
git add app/src/components/AppHeader.jsx app/src/components/AppHeader.module.css \
        app/src/components/FacilitatorHeader.jsx \
        app/src/components/LanguageSwitcher.jsx app/src/components/LanguageSwitcher.module.css \
        app/src/components/ErrorBoundary.jsx app/src/components/ErrorBoundary.module.css
git commit -m "refactor: AppHeader + shell components → ecommons-ui + CSS Modules"
```

---

## Task 3: Modal Components (MeetingFormModal, MembersModal, SettingsModal)

**Files:**
- Modify + create module CSS for each: `MeetingFormModal`, `MembersModal`, `SettingsModal`

**Interfaces:**
- Consumes: `Modal, Button, Input, Textarea, Select, Label, SectionLabel, ErrorText` from `@ecommons/ui`
- Produces: all three modals using `<Modal onOverlayClick={onClose}>` as outer wrapper

Key migration patterns in these files:

```jsx
// BEFORE
<div className="modal-overlay" onClick={onClose}>
  <div className="modal" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
      <h3 style={{ margin: 0, fontFamily: 'var(--font-title)', fontSize: '1.2rem' }}>Title</h3>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
    </div>
    <input className="input" … />
    <select className="input" … />
    <button className="btn-primary" …>Save</button>
    <button className="btn-secondary" …>Cancel</button>
    <p style={{ color: 'var(--color-red)' }}>Error message</p>
  </div>
</div>

// AFTER (import Modal, Button, Input, Select, Label, Heading, ErrorText from '@ecommons/ui')
// Create MeetingFormModal.module.css for the layout inside the modal
<Modal onOverlayClick={onClose}>
  <div className={styles.modalInner} onClick={e => e.stopPropagation()}>
    <div className={styles.modalHeader}>
      <Heading as="span" fontSize="1.2rem">Title</Heading>
      <button onClick={onClose} className={styles.closeBtn}>✕</button>
    </div>
    <Label htmlFor="date">{t('dashboard.meeting_date')}</Label>
    <Input id="date" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
    <Select value={form.location} onChange={e => set('location', e.target.value)}>…</Select>
    <div className={styles.actions}>
      <Button variant="primary" onClick={handleSubmit} disabled={saving || !form.date}>…</Button>
      <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
    </div>
    {error && <ErrorText as="p">{error}</ErrorText>}
  </div>
</Modal>
```

**Note for SettingsModal:** The file defines its own local `SectionLabel` helper — delete it and import `SectionLabel` from `@ecommons/ui` instead.

**Note for file-input label** in SettingsModal (logo upload): Keep `<label>` as the native HTML element wrapping `<input type="file" style={{display:'none'}}>` — this is a file trigger, not a form label. Style it as a `btn-secondary` button look via a CSS Module class that replicates `btn-secondary` appearance (border: 1px solid var(--color-charcoal), padding: …).

- [ ] **Step 1: Read all three modal files**

- [ ] **Step 2: Create module CSS files**

Create `MeetingFormModal.module.css`, `MembersModal.module.css`, `SettingsModal.module.css` — extract all static layout styles from the component files into these.

- [ ] **Step 3: Migrate MeetingFormModal.jsx**

Apply substitution rules. Key conversions:
- `<div className="modal-overlay"><div className="modal">` → `<Modal onOverlayClick={onClose}><div className={styles.modalInner} onClick={e=>e.stopPropagation()}>`
- `<button className="btn-primary">` → `<Button variant="primary">`
- `<button className="btn-secondary">` → `<Button variant="secondary">`
- `<input className="input">` → `<Input>`
- `<select className="input">` → `<Select>`
- `<label>` → `<Label>`
- `<p style={{color:'var(--color-red)'}}>` → `<ErrorText as="p">`
- Grid layout div → CSS Module class

- [ ] **Step 4: Migrate MembersModal.jsx**

Same substitution rules. Pay attention to the delete-confirm inline styles — move to module CSS.

- [ ] **Step 5: Migrate SettingsModal.jsx**

- Delete local `SectionLabel` function, import from `@ecommons/ui` instead
- Color picker circles stay as `<button style={{ background: c, … }}>` (dynamic background is runtime data)
- `<input type="color">` inside hex input area: keep as native (no ecommons-ui equivalent)
- File input trigger `<label className="btn-secondary">`: keep as `<label className={styles.fileBtn}>` where `.fileBtn` in module CSS replicates button styling:
  ```css
  .fileBtn {
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    font-size: 0.82rem;
    padding: var(--space-6) var(--space-12);
    border: 1px solid var(--color-charcoal);
    font-family: var(--font-sans);
    font-weight: 600;
  }
  ```

- [ ] **Step 6: Verify build**

```bash
cd /home/serzhilin/Projects/ALVer/app && npm run build 2>&1 | tail -10
```

- [ ] **Step 7: Commit**

```bash
cd /home/serzhilin/Projects/ALVer
git add app/src/components/MeetingFormModal.jsx app/src/components/MeetingFormModal.module.css \
        app/src/components/MembersModal.jsx app/src/components/MembersModal.module.css \
        app/src/components/SettingsModal.jsx app/src/components/SettingsModal.module.css
git commit -m "refactor: modal components → ecommons-ui + CSS Modules"
```

---

## Task 4: Flow Components (LoginScreen, CommunityPicker, LinkCommunityWizard)

**Files:**
- Modify + create module CSS: `LoginScreen`, `CommunityPicker`, `LinkCommunityWizard`

**Interfaces:**
- Consumes: `Button, Input, Loading, ErrorText, Panel, Card` from `@ecommons/ui`
- Produces: login flow + community picker with no bespoke styles

Key patterns in LoginScreen:

```jsx
// BEFORE — loading placeholder
<div style={{ width: 220, height: 220, background: 'var(--color-sand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
  <span style={{ color: 'var(--color-charcoal-light)', fontSize: '0.85rem' }}>{t('auth.loading_qr')}</span>
</div>

// AFTER
<Loading style={{ width: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
  {t('auth.loading_qr')}
</Loading>
```

```jsx
// BEFORE — mobile wallet button (dynamic inline, but could be Button)
<a href={offer} style={{ display:'inline-flex', … background:'#2563EB', color:'white' … }}>
  {t('auth.open_wallet_btn')}
</a>

// AFTER — keep as <a> but add CSS Module class (Button renders <button>, not <a>)
<a href={offer} className={styles.walletBtn}>
  {t('auth.open_wallet_btn')}
</a>
// In LoginScreen.module.css:
// .walletBtn { display: inline-flex; justify-content: center; padding: var(--space-12) var(--space-28); background: #2563EB; color: white; font-weight: 600; font-size: 1rem; text-decoration: none; width: 100%; }
```

```jsx
// BEFORE — name fallback input
<input className="input" value={nameInput} … />
<button className="btn-secondary" …>{t('auth.continue_as_guest')}</button>

// AFTER
<Input value={nameInput} … />
<Button variant="secondary" style={{ width: '100%' }} disabled={!nameInput.trim()} onClick={…}>{t('auth.continue_as_guest')}</Button>
```

- [ ] **Step 1: Read all three component files**

- [ ] **Step 2: Create module CSS for each, migrate static styles**

- [ ] **Step 3: Apply substitution rules to LoginScreen.jsx**

Note: `status === 'error'` paragraph → `<ErrorText as="p">`. Name input → `<Input>`. Button → `<Button variant="secondary">`. All layout divs → module CSS classes.

- [ ] **Step 4: Read and migrate CommunityPicker.jsx**

Apply standard substitution rules. The "Link community" dashed button added in Phase 1 → `<Button variant="secondary">`.

- [ ] **Step 5: Read and migrate LinkCommunityWizard.jsx**

3-step wizard. All inputs → `<Input>`, buttons → `<Button>`, error text → `<ErrorText>`, layout → module CSS.

- [ ] **Step 6: Verify build**

```bash
cd /home/serzhilin/Projects/ALVer/app && npm run build 2>&1 | tail -10
```

- [ ] **Step 7: Commit**

```bash
cd /home/serzhilin/Projects/ALVer
git add app/src/components/LoginScreen.jsx app/src/components/LoginScreen.module.css \
        app/src/components/CommunityPicker.jsx app/src/components/CommunityPicker.module.css \
        app/src/components/LinkCommunityWizard.jsx app/src/components/LinkCommunityWizard.module.css
git commit -m "refactor: login + community picker flow → ecommons-ui + CSS Modules"
```

---

## Task 5: Simple Views (AdminLogin, FacilitatorLogin, DeeplinkLogin, Register, Aanmelden)

**Files:**
- Modify + create module CSS for each of the 5 views

**Interfaces:**
- Consumes: `Page, Card, Heading, Button, Input, Label, ErrorText, Loading` from `@ecommons/ui`

Key patterns (same in AdminLogin + FacilitatorLogin — both wrap LoginScreen in a centred card):

```jsx
// BEFORE
<div style={{ minHeight: '100vh', background: 'var(--color-cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 20px' }}>
  <div style={{ width: '100%', maxWidth: 420 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 32 }}>
      <img src="/logo.png" alt="ALVer" style={{ height: 40, objectFit: 'contain' }} />
      <h1 style={{ fontSize: '1.3rem', margin: 0, fontFamily: 'var(--font-title)', lineHeight: 1 }}>ALVer: Admin</h1>
    </div>
    <div className="card" style={{ padding: 28 }}>
      <LoginScreen … />
    </div>
  </div>
</div>

// AFTER
import styles from './AdminLogin.module.css'
import { Page, Card, Heading } from '@ecommons/ui'

<div className={styles.root}>
  <Page maxWidth={420}>
    <div className={styles.logoRow}>
      <img src="/logo.png" alt="ALVer" className={styles.logo} />
      <Heading as="h1" fontSize="1.3rem">ALVer: Admin</Heading>
    </div>
    <Card style={{ padding: 'var(--space-28)' }}>
      <LoginScreen … />
    </Card>
  </Page>
</div>
```

```css
/* AdminLogin.module.css */
.root { min-height: 100vh; background: var(--color-cream); display: flex; align-items: center; justify-content: center; padding: var(--space-32) var(--space-20); }
.logoRow { display: flex; align-items: center; justify-content: center; gap: var(--space-12); margin-bottom: var(--space-32); }
.logo { height: 40px; object-fit: contain; }
.navLinks { margin-top: var(--space-20); display: flex; justify-content: center; gap: var(--space-24); font-size: 0.82rem; }
.navLink { color: var(--color-terracotta); text-decoration: none; font-weight: 500; }
```

- [ ] **Step 1: Read all 5 view files**

Run: `cat app/src/views/AdminLogin.jsx app/src/views/FacilitatorLogin.jsx app/src/views/DeeplinkLogin.jsx app/src/views/Register.jsx app/src/views/Aanmelden.jsx`

- [ ] **Step 2: Create module CSS files and migrate each view**

Apply substitution rules. Each view gets its own `.module.css`. Common ecommons-ui imports: `Page, Card, Heading, Button, Input, Label, ErrorText`.

- [ ] **Step 3: Verify build**

```bash
cd /home/serzhilin/Projects/ALVer/app && npm run build 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
cd /home/serzhilin/Projects/ALVer
git add app/src/views/AdminLogin.jsx app/src/views/AdminLogin.module.css \
        app/src/views/FacilitatorLogin.jsx app/src/views/FacilitatorLogin.module.css \
        app/src/views/DeeplinkLogin.jsx app/src/views/DeeplinkLogin.module.css \
        app/src/views/Register.jsx app/src/views/Register.module.css \
        app/src/views/Aanmelden.jsx app/src/views/Aanmelden.module.css
git commit -m "refactor: simple views → ecommons-ui + CSS Modules"
```

---

## Task 6: Home View

**Files:**
- Modify: `app/src/views/Home.jsx`
- Create: `app/src/views/Home.module.css`

**Interfaces:**
- Consumes: `Page, Card, Badge, Button, Loading, Heading, SectionLabel, ErrorText` from `@ecommons/ui`

`Home.jsx` is ~750 lines. Read it fully before starting. Key patterns to migrate:

**Status badges** — `badge-gray`, `badge-green`, `badge-blue` spans:
```jsx
// BEFORE
<span className={`badge ${statusColor(m.status)}`}>{m.status}</span>
// where statusColor returns 'badge-gray' | 'badge-blue' | 'badge-green'

// AFTER
function statusVariant(s) {
  return { draft: 'gray', open: 'blue', in_session: 'green', archived: 'gray' }[s] || 'gray'
}
<Badge variant={statusVariant(m.status)}>{m.status}</Badge>
```

**Meeting list container:**
```jsx
// BEFORE
<div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
// AFTER
<Page maxWidth={720} style={{ padding: 'var(--space-24) var(--space-16)' }}>
```

**Meeting cards:**
```jsx
// BEFORE: <div className="card upcoming-row" style={{…}}>
// AFTER: <Card className={`${styles.meetingRow} upcoming-row`}>
```

**Section headings:**
```jsx
// BEFORE: <h2 style={{ fontFamily: 'var(--font-title)', … }}>Upcoming</h2>
// AFTER: <SectionLabel>Upcoming</SectionLabel>   (or Heading if it's a real h2)
```

**Buttons** (`btn-primary`, `btn-secondary`):
```jsx
<Button variant="primary" onClick={…}>…</Button>
<Button variant="secondary" onClick={…}>…</Button>
```

**Loading states:**
```jsx
// BEFORE: <div style={{ textAlign:'center', padding:40, color:'var(--color-charcoal-light)' }}>Loading…</div>
// AFTER: <Loading style={{ textAlign: 'center', padding: 'var(--space-32)' }}>Loading…</Loading>
```

- [ ] **Step 1: Read Home.jsx in full**

```bash
cat /home/serzhilin/Projects/ALVer/app/src/views/Home.jsx
```

- [ ] **Step 2: Create Home.module.css** with all static layout classes extracted from the component

- [ ] **Step 3: Migrate Home.jsx** — apply all substitution rules; keep `.upcoming-row` and `.upcoming-row-btn` class names (defined in global `index.css`) as-is since they're used for the hover reveal behavior

- [ ] **Step 4: Verify build**

```bash
cd /home/serzhilin/Projects/ALVer/app && npm run build 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
cd /home/serzhilin/Projects/ALVer
git add app/src/views/Home.jsx app/src/views/Home.module.css
git commit -m "refactor: Home view → ecommons-ui + CSS Modules"
```

---

## Task 7: Attend, Archive, MinutesEditor Views

**Files:**
- Modify + create module CSS: `Attend.jsx`, `Archive.jsx`, `MinutesEditor.jsx`

**Interfaces:**
- Consumes: `Page, Card, Button, Input, Badge, Loading, Heading, ErrorText, SectionLabel` from `@ecommons/ui`

- [ ] **Step 1: Read all three files**

```bash
cat /home/serzhilin/Projects/ALVer/app/src/views/Attend.jsx
cat /home/serzhilin/Projects/ALVer/app/src/views/Archive.jsx
cat /home/serzhilin/Projects/ALVer/app/src/views/MinutesEditor.jsx
```

- [ ] **Step 2: Create module CSS files, migrate each file** using standard substitution rules

MinutesEditor note: it wraps `RichTextEditor` (skip) and has its own layout/buttons — migrate those.

- [ ] **Step 3: Verify build**

```bash
cd /home/serzhilin/Projects/ALVer/app && npm run build 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
cd /home/serzhilin/Projects/ALVer
git add app/src/views/Attend.jsx app/src/views/Attend.module.css \
        app/src/views/Archive.jsx app/src/views/Archive.module.css \
        app/src/views/MinutesEditor.jsx app/src/views/MinutesEditor.module.css
git commit -m "refactor: Attend, Archive, MinutesEditor → ecommons-ui + CSS Modules"
```

---

## Task 8: Facilitate View

**Files:**
- Modify: `app/src/views/Facilitate.jsx` (~1014 lines)
- Create: `app/src/views/Facilitate.module.css`

**Interfaces:**
- Consumes: `Page, Card, Panel, Button, Badge, Loading, Heading, SectionLabel, ErrorText, ProgressBar` from `@ecommons/ui`

This is the most complex file. Read it fully before starting. Key patterns unique to Facilitate:

**Phase badge** (live session indicator):
```jsx
// BEFORE: <span className="badge badge-green animate-pulse-soft">LIVE</span>
// AFTER: <Badge variant="green" className="animate-pulse-soft">LIVE</Badge>
```

**Vote reveal animation** — the `.reveal-result` class is defined in `index.css` and applied to divs during vote reveal. Keep it as `className="reveal-result"` — do not move to module CSS.

**Poll option buttons** (often custom styled toggles):
```jsx
// BEFORE: <button className={selected ? 'btn-primary' : 'btn-secondary'} onClick={…}>
// AFTER: <Button variant={selected ? 'primary' : 'secondary'} onClick={…}>
```

**Progress bar** (if present for vote counting):
```jsx
// BEFORE: <div style={{ height: 6, background: 'var(--color-sand)' }}><div style={{ height: '100%', width: pct+'%', background: 'var(--color-terracotta)' }} /></div>
// AFTER: <ProgressBar value={pct} max={100} />
// OR keep as inline if ProgressBar API doesn't fit the design — check ProgressBar.tsx first
```

**Greeting flash** — the `.greeting-flash` class is in `index.css` global, keep as is.

- [ ] **Step 1: Read Facilitate.jsx in full**

```bash
cat /home/serzhilin/Projects/ALVer/app/src/views/Facilitate.jsx
```

- [ ] **Step 2: Check ProgressBar API**

```bash
cat /home/serzhilin/Projects/ecommons-ui/src/components/ProgressBar.tsx
```

Use `<ProgressBar>` if it fits; otherwise keep the inline div pair for vote bar (dynamic width = inline style is acceptable).

- [ ] **Step 3: Create Facilitate.module.css** — extract all static layout styles

- [ ] **Step 4: Migrate Facilitate.jsx** — apply all substitution rules. Keep `.reveal-result`, `.greeting-flash`, `.animate-pulse-soft` as className strings (global CSS); move all other class strings and static inline styles to module CSS.

- [ ] **Step 5: Verify build**

```bash
cd /home/serzhilin/Projects/ALVer/app && npm run build 2>&1 | tail -10
```

- [ ] **Step 6: Commit**

```bash
cd /home/serzhilin/Projects/ALVer
git add app/src/views/Facilitate.jsx app/src/views/Facilitate.module.css
git commit -m "refactor: Facilitate view → ecommons-ui + CSS Modules"
```

---

## Task 9: Display View + Final Audit

**Files:**
- Modify: `app/src/views/Display.jsx`
- Create: `app/src/views/Display.module.css`
- Modify: `app/src/views/AdminDashboard.jsx`
- Create: `app/src/views/AdminDashboard.module.css`

**Interfaces:**
- Consumes: `Page, Card, Heading, Badge, Button, Loading, SectionLabel` from `@ecommons/ui`

Display.jsx is the projector/big-screen view. It uses the chart components (skip those inner elements) but has its own layout and status indicators.

AdminDashboard.jsx was not in the original task list but likely still has bespoke styles — read and migrate it.

- [ ] **Step 1: Read Display.jsx and AdminDashboard.jsx in full**

```bash
cat /home/serzhilin/Projects/ALVer/app/src/views/Display.jsx
cat /home/serzhilin/Projects/ALVer/app/src/views/AdminDashboard.jsx
```

- [ ] **Step 2: Create module CSS files and migrate both views**

Apply standard substitution rules.

- [ ] **Step 3: Final audit — check for remaining Tailwind classes**

```bash
cd /home/serzhilin/Projects/ALVer/app
grep -r 'className="[^"]*\b\(flex\|grid\|gap-\|p-\|m-\|text-\|bg-\|border-\|rounded\|w-\|h-\|items-\|justify-\|font-\|block\|inline\|hidden\|overflow\)\b' src/ --include="*.jsx" -l
```

Expected: no matches (or only in files deliberately skipped: charts/, AgendaHtml.jsx, RichTextEditor.jsx).

- [ ] **Step 4: Final audit — check for remaining static inline styles**

```bash
grep -rn 'style={{ *display\|style={{ *padding\|style={{ *margin\|style={{ *gap\|style={{ *flexDirection\|style={{ *alignItems\|style={{ *justifyContent\|style={{ *background.*--color\|style={{ *fontSize\|style={{ *fontFamily' src/views src/components --include="*.jsx" | grep -v 'charts/' | grep -v 'AgendaHtml' | grep -v 'RichTextEditor'
```

Review each match: if the value is static (not from a variable), move it to the module CSS. If it's dynamic (uses a variable from props/state), keep it.

- [ ] **Step 5: Final build**

```bash
cd /home/serzhilin/Projects/ALVer/app && npm run build 2>&1
```

Expected: clean build, zero errors.

- [ ] **Step 6: Commit**

```bash
cd /home/serzhilin/Projects/ALVer
git add app/src/views/Display.jsx app/src/views/Display.module.css \
        app/src/views/AdminDashboard.jsx app/src/views/AdminDashboard.module.css
git commit -m "refactor: Display + AdminDashboard → ecommons-ui + CSS Modules; final audit clean"
```
