# Accessibility & mobile UI review: OpenShoot

- **Scope:** `src/app/globals.css`, `src/app/**/{layout,page,error,not-found}.tsx`, and every component under `src/components/**`, including `ui/`, `layout/`, `app/` and all feature folders.
- **Method:** static review only. Nothing was built or run. Contrast ratios were computed from the OKLCH tokens in `globals.css` (OKLCH → sRGB → WCAG relative luminance). Alpha tints were composited over the surface they sit on.
- **Standard:** WCAG 2.2 AA. Mobile-first quality checks (44 px touch targets, layout at 360–390 px, safe areas, landscape, text zoom) are reported separately as `MOB-n`.
- **Severity:**
  - **High:** blocks or seriously degrades a task for a group of users.
  - **Medium:** a WCAG AA failure or significant friction.
  - **Low:** a best-practice gap or an edge case.

## Summary

| | High | Medium | Low | Total |
|---|---|---|---|---|
| A11Y | 2 | 18 | 21 | 41 |
| MOB | 1 | 5 | 5 | 11 |
| **All** | **3** | **23** | **26** | **52** |

**Top 5**

1. **A11Y-1:** Most focus indicators fail 3:1. On light backgrounds `ring-ring/50` measures 2.32:1, the brand button ring 1.93:1, and the destructive button ring 1.39:1 (1.25:1 in dark mode).
2. **A11Y-2:** `outline-none` plus box-shadow rings (70 uses in 57 files). In Windows forced-colors (High Contrast) mode most controls show no focus indicator at all.
3. **MOB-1:** `SheetContent` cannot scroll. In landscape on small phones, or at 200% zoom, items in the mobile "More" navigation sheet and the marketing menu cannot be reached.
4. **A11Y-3:** Nothing sets `scroll-padding`. The sticky top bar and the fixed bottom nav, action bar and selection bar (up to ~160 px on phones) can fully cover the focused element, which fails WCAG 2.4.11.
5. **A11Y-7 / A11Y-14:** `CardTitle` renders a `<div>`, so Settings, Billing, Team and API-key sections have no headings. Seven routes have no `<h1>`: login, verify, suspended, delete-confirm, two invite pages and the photo viewer.

---

## Token contrast (computed from `globals.css`)

| Pair | Light | Dark | Notes |
|---|---|---|---|
| foreground / background | 18.42 | 17.83 | OK |
| muted-foreground / background · card · muted · accent | 6.54 · 6.77 · 6.00 · 5.83 | 7.65 · 7.30 · 6.56 · 6.22 | OK |
| primary-foreground / primary | 6.07 | 7.88 | OK |
| primary (link text) / background | 5.97 | 8.06 | OK |
| destructive / card | 5.24 | 5.51 | OK |
| success / card | 5.14 | 8.99 | OK |
| warning / card | 4.95 | 9.94 | OK |
| brand-soft-foreground / brand-soft | 7.62 | 9.44 | OK |
| **success on success/10 (Badge)** | **4.49** | 7.70 | Fails at 12 px (A11Y-4) |
| **warning on warning/10 (Badge)** | **4.34** | 8.37 | Fails (A11Y-4) |
| input border / background | 3.21 | 3.01 | OK |
| input border / card | 3.33 | **2.87** | Marginal in dark mode |
| **ring/50 focus ring / background** | **2.32** | **2.76** | Fails 1.4.11 (A11Y-1) |
| **primary/40 (brand button ring)** | **1.93** | 2.17 | Fails (A11Y-1) |
| **destructive/20 (destructive button ring)** | **1.39** | **1.25** | Fails (A11Y-1) |
| **switch track input/70 / background** | **2.15** | **2.04** | Fails 1.4.11 (A11Y-5) |
| **white on success / warning** | 5.20 / 5.01 | **2.09 / 1.89** | Fails in dark mode (A11Y-6) |
| white on brand-coral / magenta / violet | **4.32** / 5.14 / 6.23 | same | Coral stop is below 4.5 (A11Y-9) |
| **muted-foreground/80** | **4.08** | 5.21 | Fails (A11Y-41) |
| muted-foreground on `glass` over a black / white image | **3.87** / 6.60 | 7.76 / **4.00** | A11Y-10 |
| chart-5 / card | 2.67 | 9.99 | Not used for meaning (the bar chart uses chart-3 and has a data table) |

---

## Findings

### 1. Global and design system (`globals.css`, `components/ui/*`)

| ID | Sev | Location | Issue | Fix |
|---|---|---|---|---|
| A11Y-1 | High | `ui/button.tsx:8,14,21`; `globals.css:229`; shared pattern in `layout/*` (sidebar, bottom nav, logo, footer), `app/page-header.tsx:24`, chips and cards | The focus indicator on controls without a border (default, ghost, secondary, brand and destructive buttons; nav links; chips; cards) is only a 3 px box-shadow at 50% alpha: 2.32:1 light, 2.76:1 dark. The brand button uses `ring-primary/40` (1.93:1). The destructive button uses `ring-destructive/20` (1.39:1 light, 1.25:1 dark), which is effectively invisible. The base rule `* { outline-ring/50 }` also turns the browser's default outlines (unstyled links and `<summary>` in API docs) to about 2.3:1. Fails 1.4.11 for focus indicators. Inputs and outline toggles are fine because `border-ring` is solid. | Use one token-level focus style, for example `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring` (5.97:1 / 8.06:1), or a solid ring with `ring-offset-2 ring-offset-background`. Drop the `/20`, `/40` and `/50` variants. Change the base rule to `outline-ring`. |
| A11Y-2 | High | 70 occurrences of `outline-none` in 57 files (`ui/button.tsx:8`, `ui/input.tsx:11`, `ui/select.tsx:34`, `ui/toggle.tsx:10`, `layout/*`, …) | In Tailwind 4.3.3, `outline-none` means `outline-style: none` with no forced-colors fallback. Forced-colors mode removes box-shadows and overrides border colours, so Windows High Contrast users see no focus at all. Fails 2.4.7 in that mode. | Replace with `outline-hidden`, which emits `outline: 2px solid transparent` under `forced-colors: active`. Or add `@media (forced-colors: active) { :focus-visible { outline: 2px solid CanvasText; outline-offset: 2px } }` to `globals.css`. |
| A11Y-3 | Medium | `globals.css` (no `scroll-padding`); `app-topbar.tsx` (sticky, 56–64 px); `mobile-bottom-nav.tsx:32` (fixed, about 68–94 px); `create/controls.tsx:177-186` (fixed, 65 px); `gallery/selection-bar.tsx:64` | When tabbing, the browser scrolls the focused element only to the viewport edge, where these bars can cover it completely. Fails 2.4.11 Focus Not Obscured (Minimum). | `html { scroll-padding-top: 5rem; scroll-padding-bottom: calc(var(--bottom-stack, 0px) + 1rem) }`. Set `--bottom-stack` to the nav height plus the action bar below `md` (see MOB-4). |
| A11Y-4 | Medium | `ui/badge.tsx:19-20`; used by `JobStatusBadge` (`app/job-progress.tsx:23-30`), batch status, the "months free" badge; `providers/index.tsx:25` (`richColors`) | Light-mode `success` / `warning` badge text on its own 10% tint measures 4.49:1 / 4.34:1 at 12 px. Sonner's `richColors` error toast (red on pink) is about 4.3:1 by estimate. Fails 1.4.3. | Darken the light-mode `--success` to about `oklch(0.48 0.12 155)` and `--warning` to about `oklch(0.50 0.12 65)`, or use `text-foreground` with a coloured icon. Drop `richColors` or override the toast tokens. |
| A11Y-5 | Medium | `ui/switch.tsx:13` | The unchecked track (`bg-input/70`) is 2.15:1 against the page (2.04:1 dark). In light mode the thumb (`bg-background`) against the track is also 2.15:1, so both the control boundary and its state fail 1.4.11. | Use `bg-input` (3.2:1) plus a border on the unchecked track, and give the thumb a 1 px `ring-foreground/40`. |
| A11Y-6 | Medium | `models/photo-grid.tsx:140`, `app/image-dropzone.tsx:378`, `models/model-wizard.tsx:295`, `try-on/step-section.tsx:30` | In dark mode, white check and warning glyphs sit on `bg-success` / `bg-warning`: 2.09:1 / 1.89:1. Status meaning is lost for low-vision users (1.4.11). | Add `--success-foreground` / `--warning-foreground` tokens that are dark in dark mode, or use `text-background`. |
| A11Y-7 | Medium | `ui/card.tsx:31-33` (`CardTitle` is a `div`). Used as the section title in the settings cards, the billing plan, pack and current-plan cards, the team cards (`teams/*`), `together/together-composer.tsx`, `enhance/enhance-panel.tsx` and `auth/api-keys-manager.tsx` ("Your keys") | Visual section headings have no heading role, so `/app/settings`, `/app/billing` and `/app/team` expose only the `h1` to heading navigation. Fails 1.3.1. | Render `CardTitle` as `h2` by default, with an `as` / `asChild` prop so callers can choose `h3`. Keep the styling. |
| A11Y-8 | Low | `ui/alert.tsx:26` | Every `Alert` carries `role="alert"`, including static notices (the dev-mailbox note, plan-limit and batch-shortfall warnings, billing notices). `ApiErrorAlert` also moves focus to the alert, so the error is announced twice. | Remove the default role. Pass `role="alert"` only for errors inserted at runtime, and drop it where focus is moved. |
| A11Y-9 | Low | `globals.css:42`, `ui/badge.tsx:17`, `ui/button.tsx:21`, `marketing/final-cta.tsx:20-23` | White on the coral gradient stop is 4.32:1. The 12 px `brand` badge text and the left part of `brand` button labels sit on it. The final CTA's `text-white/90` lead text over coral is about 3.9:1. | Darken `--brand-coral` to about `oklch(0.57 0.195 34)`, or start the gradient at 15%. |
| A11Y-10 | Low | `globals.css:216-220` (`glass`), `layout/mobile-bottom-nav.tsx:19` | The bars are 78% opaque. With dark photos scrolling under them (light theme) or light photos (dark theme), the 11 px inactive tab labels fall to 3.87:1 / 4.0:1. | Raise to 90–94% `color-mix`, or use `text-foreground/75` for inactive labels. |
| A11Y-11 | Low | `ui/table.tsx:7`, `api-docs/primitives.tsx:87`, `marketing/legal-document.tsx:60`, `(marketing)/docs/page.tsx:197` | Horizontally scrolling table wrappers are not focusable and have no name, so Safari keyboard users cannot scroll them (2.1.1). Code `<pre>` blocks already do this correctly. | Add `tabIndex={0} role="region" aria-label={caption}` and a visible focus style to the scroll wrapper. |
| MOB-1 | High | `ui/sheet.tsx:54-62`; affects `layout/mobile-bottom-nav.tsx:49` and `layout/marketing-mobile-nav.tsx:29` | `SheetContent` has no `overflow-y-auto`. The bottom "More" sheet is capped at `max-h-[85dvh]` but holds 10–11 tiles 80 px tall (about 440 px). On a 640×360 landscape phone, or at 200% zoom, the last row (Settings, API keys, Admin) is clipped and cannot be reached. The marketing side sheet has the same problem. Fails 1.4.10 / 1.4.4. The gallery folders sheet works only because it passes `overflow-y-auto` itself. | Add `overflow-y-auto overscroll-contain` to the `SheetContent` base classes, and use `max-h-[calc(100dvh-env(safe-area-inset-top))]` for the bottom sheet. |
| MOB-2 | Medium | `ui/alert-dialog.tsx:41` | Unlike `DialogContent`, `AlertDialogContent` has no `max-h`/`overflow-y-auto`. Confirm dialogs with long descriptions or extra content (deletion scope, admin actions) run off-screen in landscape or with large text, and their buttons cannot be reached. | Copy the `DialogContent` treatment: `max-h-[calc(100dvh-2rem)] overflow-y-auto`. |
| MOB-3 | Medium | `ui/button.tsx:24-29` (default 36 px, `sm` 32, `icon-sm` 32); `ui/dialog.tsx:61` and `ui/sheet.tsx:69` (close X about 16×16 with no padding); `ui/switch.tsx:13` (18 px tall); `ui/slider.tsx:62` (16 px thumb); `app/media-card.tsx:156` (32 px heart); `create/generation-result.tsx:130,166` and `create/batch-progress.tsx:221` (28 px edit and dismiss); prompt suggestion chips (about 24 px); `layout/marketing-header.tsx:38-41` ("Get started" is `sm`, 32 px) | WCAG 2.5.8 (24 px, or the spacing exception) is mostly met. The mobile-first target is 44 px, and core phone controls fall well short of it: closing every dialog, favouriting, editing from a tile, the brush slider, and the primary marketing CTA. | Add a coarse-pointer size bump to the CVA variants (for example `pointer-coarse:h-11`, `pointer-coarse:size-11`), or enlarge hit areas invisibly (`relative after:absolute after:-inset-2`). Give the dialog and sheet close buttons `size-9` / `p-2`. |
| MOB-4 | Medium | `create/controls.tsx:177-186`, `gallery/selection-bar.tsx:64`, `layout/mobile-bottom-nav.tsx:19` | Bottom-stack offsets are magic numbers (`3.75rem + max(.5rem, inset)` in one place, `5rem + inset` in another). They depend on the bottom nav's pixel-sized text (`text-[11px]`, `size-5`). With Android font scaling or iOS/Chrome text zoom, the nav grows and the sticky Generate bar overlaps the tab labels. | Define `--bottom-nav-h` once, on the nav or as a CSS constant in `rem` that covers the label line-height. Base `bottom` on it for both bars, and use it for the `main` bottom padding and `scroll-padding-bottom`. |
| MOB-5 | Medium | `app/layout.tsx` viewport (`viewportFit: "cover"`); `layout/mobile-bottom-nav.tsx:32` (`inset-x-0`); `create/controls.tsx:180`; `layout/app-topbar.tsx` (header `px-4`); `ui/sheet.tsx` side sheets | The viewport opts into edge-to-edge, but only the bottom inset is handled (`pb-safe`). In landscape on notched iPhones, the edge tabs, the Generate button and the top-bar avatar sit under the sensor housing and rounded corners. | Add `pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]` (a `px-safe` utility) to the fixed and sticky bars and the side sheets. Add `pt-[env(safe-area-inset-top)]` if you ever enable standalone PWA mode (`statusBarStyle: black-translucent` is already set). |
| MOB-6 | Low | `app/page-header.tsx:31` (`h1` without wrapping); `ui/alert.tsx:33` (`AlertTitle line-clamp-1`); `gallery/media-viewer.tsx:445` (`dd truncate`) | Long unbroken names (team and model names of up to 60 characters) overflow at 360 px. Alert titles and viewer details (model and pack names) are cut off with no way to read the rest, which is content loss under 1.4.10 at 320 px. | Add `h1,h2,h3 { overflow-wrap: anywhere }` in `globals.css`. Remove the default `line-clamp-1` and allow `dd` to wrap (`break-words`). |

### 2. App shell, navigation and layouts

| ID | Sev | Location | Issue | Fix |
|---|---|---|---|---|
| A11Y-12 | Medium | `app/admin/layout.tsx:34` | Below `sm`, the "Back to app" link becomes icon-only because its text is `hidden sm:inline` (`display:none`). The link then has no accessible name. Fails 2.4.4 / 4.1.2. | `className="sr-only sm:not-sr-only"`, or add `aria-label`. |
| A11Y-13 | Low | `layout/app-sidebar.tsx:18,74` | Primary navigation is wrapped in `<aside>`, which creates a complementary landmark around the main navigation. The group labels are `<p>` elements not tied to their lists. | Use a `<div>` (the `nav` already has a label). Add `aria-labelledby` from each `<ul>` to its group label. |

### 3. Auth, invites and standalone pages

| ID | Sev | Location | Issue | Fix |
|---|---|---|---|---|
| A11Y-14 | Medium | `(auth)/login` (`auth/login-form.tsx:77,126`), `(auth)/verify/page.tsx:33,57`, `suspended/page.tsx:28`, `account/delete/confirm` (`settings/delete-account-confirm.tsx:108,130,157`), `invites/[token]/page.tsx:42`, `teams/join/[token]/page.tsx:32,57`, `app/gallery/[mediaId]` (`gallery/media-viewer.tsx` has only `h2`s) | These pages have no `<h1>`. The page title is a `CardTitle` `div`, or missing entirely in the viewer. Screen-reader users cannot jump to the page's purpose. | Render these titles as `<h1>`, using `CardTitle` with the `as` prop from A11Y-7. Add an `sr-only` `<h1>` to the viewer, for example "Photo from {date}". |
| A11Y-15 | Medium | `auth/login-form.tsx:70-83` | On "Send magic link" success, the form (and the focused submit button) is replaced by the "Check your inbox" card. Focus falls to `<body>`. The `aria-live` region is mounted together with its content, so nothing is announced. | Keep a persistent `role="status"` region outside the swapped card, or focus the new title (`tabIndex={-1}` plus `ref.focus()`). |
| A11Y-16 | Low | `together/invite-friend-card.tsx:77` | The friend's email field uses `autoComplete="email"`, so browsers prefill the user's own address. Using that token for someone else's address is misleading under 1.3.5. | `autoComplete="off"`. |

### 4. Marketing (`(marketing)/*`, `components/marketing/*`)

| ID | Sev | Location | Issue | Fix |
|---|---|---|---|---|
| A11Y-17 | Medium | `marketing/comparison-table.tsx:46-47,63` | Below `sm`, the "Topic" column header is `display:none` while each body row still has the row `th` plus two `td`s, and rows switch to `display:grid`. Header association shifts by one column, so the OpenShoot answer is announced under "Typical AI photo apps". WebKit also drops table semantics when rows use `display:grid`. Fails 1.3.1. | Keep the header as `sr-only` instead of hidden, and don't change the `tr` display. For mobile, render a stacked `<dl>`/card list and hide the table (or the reverse). |
| A11Y-18 | Low | `marketing/faq-list.tsx:26-27` | The question `h2`/`h3` sits inside `<summary>`. VoiceOver/Safari flattens `summary` content, so the FAQ headings can't be reached by heading navigation. | Accept this (it is native and has no JavaScript), or switch to a heading wrapping a disclosure `<button>` (the Radix Accordion pattern). |
| A11Y-19 | Low | `layout/*`, `marketing/hero.tsx`, `final-cta.tsx` | GitHub and other `target="_blank"` links give no warning that they open a new tab (advisory G201). | Add `<span className="sr-only">(opens in a new tab)</span>` or an external-link icon with a label. |
| MOB-7 | Low | `marketing/legal-document.tsx:128` | The legal "On this page" table of contents is `hidden lg:block`, so phones have no section navigation for long documents. | Add a collapsible `<details>` TOC below `lg`, as `api-docs` does. |

### 5. Create, packs and batches

| ID | Sev | Location | Issue | Fix |
|---|---|---|---|---|
| A11Y-20 | Medium | `create/pack-studio.tsx:298-317` (`PackHero`) | White title, tagline and badges sit over the pack's own gradient with only a `from-black/45 via-black/15` scrim. 28 of 64 packs end in a light colour (`#e0f2fe`, `#fde68a`, `#f5f5f4`, …). Estimated tagline contrast falls below 4.5:1 for those 28 and below 3:1 for 7: quiet-luxury 2.2:1; instant-film, beach-resort and tennis about 2.5:1; swiss-alps and medical-professional 2.9:1. | Use a stronger scrim (`from-black/70 via-black/45`) behind the text block, or choose `text-neutral-950` when the gradient's end colour has luminance above 0.5. |
| A11Y-21 | Low | `create/create-studio.tsx:~102-112`, `create/pack-studio.tsx` | Validation is a single focused `ApiErrorAlert`. The offending field (prompt, model) never gets `aria-invalid` or `aria-describedby`. | Map `built.message` to a field and set `aria-invalid` plus `aria-describedby` on it, or focus the field. |
| A11Y-22 | Low | `create/generation-result.tsx:114-127` | Label-in-name: when a draft re-render has started, the visible text is "Rendering" but the accessible name is "Full-quality version started" (2.5.3). | Use matching text, for example the visible text "Rendering full quality". |
| A11Y-23 | Low | `create/prompt-field.tsx:164-170`, `edit/brush-panel.tsx:116` | "Improve" is `disabled` with an `aria-describedby` hint that can never be read, because disabled buttons can't be focused. The brush "Repaint" button is disabled when the prompt is shorter than 2 characters, with no visible reason. | Use `aria-disabled` plus a visible hint, or show the requirement next to the field. |
| A11Y-24 | Low | `create/pack-studio.tsx:183` (`lg:order-2`) and `:249-265` | On desktop, DOM order is form then shot list, but the visual order is the reverse (2.4.3 / 1.3.2). The drafts `role="status"` region mounts only once a draft exists, so the first "started" announcement is lost. | Match DOM order to visual order (or use the `grid-template-areas` order). Keep the live region mounted outside the conditional section. |
| MOB-8 | Low | `create/controls.tsx:155-170` (`InstantModeBadge`) | The "Instant model · 2× credits" explanation is tooltip-only. Radix tooltips don't open on tap, so phone users can't learn why credits cost more. | Use a `Popover` (opens on tap) or inline helper text on coarse pointers. |

### 6. Edit studio (mask painter, before/after, enhance)

| ID | Sev | Location | Issue | Fix |
|---|---|---|---|---|
| A11Y-25 | Medium | `edit/mask-painter.tsx:324-354,390` | `role="application"` and the keyboard shortcuts cover tools, brush size, zoom and pan, but no key paints or erases. The inpaint ("Brush") feature can't be used without a pointer (2.1.1; the path-based exception is arguable, because selecting a region doesn't inherently need a path). Panning has no single-pointer alternative to dragging (2.5.7). | Add a keyboard cursor: arrows move a reticle, Space stamps a dab, Shift+arrows draw. Add pan buttons, or "select subject/background" presets. |
| A11Y-26 | Medium | `enhance/enhance-quick-actions.tsx:88-106` (shown in `gallery/media-viewer.tsx` "Enhance") | The quick actions are icon-only. Their meaning and credit cost are only in a tooltip, which doesn't appear on touch. A single tap starts a paid job with no confirmation. | Show labels with cost on coarse pointers (`pointer-coarse:` text), or use a labelled menu with items such as "Upscale · 2 credits". |
| MOB-9 | Medium | `edit/mask-painter.tsx:405-411`, `edit/edit-studio.tsx:84-92` | At 360–390 px the painter is full width (`maxWidth` is `70dvh × ratio`, larger than the column). At 4:5 it is about 410 px tall and `touch-none`. The page can only scroll from the two 16 px gutters, and two-finger gestures are captured for pinch. Users get stuck on the canvas. | Cap the height on phones (`max-h-[55dvh]`, `mx-auto` width), or add a "lock/unlock canvas" toggle so the move tool or idle state uses `touch-pan-y`. |
| A11Y-27 | Low | `edit/edit-studio.tsx:72`, `models/model-wizard.tsx:69`, `video/video-studio.tsx:57` | JavaScript `behavior: "smooth"` scrolling ignores `prefers-reduced-motion`. The CSS override doesn't affect `scrollIntoView` options. `create-studio.tsx` already handles this correctly. | Reuse the `matchMedia("(prefers-reduced-motion: reduce)")` guard from `create-studio`. |

### 7. Gallery, media viewer and public share

| ID | Sev | Location | Issue | Fix |
|---|---|---|---|---|
| A11Y-28 | Medium | `gallery/media-viewer.tsx:71-74,105-116` | A window-level `keydown` handler maps ArrowLeft/ArrowRight to previous/next and Escape to "back to gallery". `isTypingTarget` ignores `VIDEO`/`AUDIO` and widgets that use arrow keys, so keyboard users who focus the native `<video>` to seek are navigated to another item instead. | Ignore events whose target is a media element, `[role=slider]`, `[role=radiogroup]` or `[role=toolbar]`. Or handle the keys only when focus is on `body` or the `figure`. |
| A11Y-29 | Medium | `gallery/media-viewer.tsx:185`, `s/[token]/page.tsx:93`, `video/video-job-card.tsx:32` | Videos carry an empty `<track kind="captions" />` with no `src`, which looks compliant but provides nothing. Talking videos contain synthetic speech from a known script and have no captions (1.2.2). | Generate WebVTT from the script when the job completes and serve it as `src`. Remove the empty track for silent clips. |
| A11Y-30 | Medium | `gallery/selection-bar.tsx:66`, `gallery/gallery-view.tsx:116,244` | Exiting selection mode (X button) or deleting removes the bar that has focus, and focus is lost to `<body>`. | Move focus back to the toolbar's "Select" toggle when selection mode ends. |
| A11Y-31 | Low | `app/media-card.tsx:152` | The favourite button combines `aria-pressed` with a label that changes ("Favorite" / "Unfavorite"), so it announces as "Unfavorite, toggle button, pressed". | Keep the label fixed ("Favorite") and let `aria-pressed` carry the state. |
| A11Y-32 | Low | `app/gallery/[mediaId]/page.tsx:9` | Every photo has the static title "Photo". Next's route announcer therefore says nothing when arrow keys move to the previous or next item, so there is no screen-reader feedback. | Use `generateMetadata` to produce a title like "Photo · 12 Mar 2026", or a polite announcement such as "Photo 3 of 40". |
| A11Y-33 | Low | `gallery/share-dialog.tsx:~99-119`, `app/media-card.tsx:188` | Lists repeat identical control names: every row has "Share link" and "Revoke", and every untitled media card is named "Open image". | Add context, for example "Revoke link created 3 May, expires in 7 days", or "Photo from 3 May". |
| A11Y-34 | Low | `gallery/report-dialog.tsx:106` | After the report is submitted, the form is replaced by a `role="status"` block that is mounted with its content (not reliably announced), and the submit button's focus is lost. | Focus the success `DialogTitle`. |

### 8. Models (wizard, consent camera, photos)

| ID | Sev | Location | Issue | Fix |
|---|---|---|---|---|
| A11Y-35 | Medium | `models/camera-capture.tsx:288-330` | Each phase swaps in different buttons: "Open camera", then "Take selfie" (disabled during countdown), then "Retake" / "Use selfie". The focused button disappears or becomes disabled at every step, so keyboard and switch users must tab again from the top. | Keep one primary button element across phases (change its label), or call `focus()` on the new primary button after the phase changes. |
| A11Y-36 | Medium | `models/consent-step.tsx:33`, `models/camera-capture.tsx:239-243` | Consent requires a live camera selfie ("no file upload"), with only visual alignment guidance ("Center your face in the oval", the oval overlay). Blind or low-vision users and users without a camera have no path to create a model. | Keep the safety requirement but add an assisted route (support or manual verification). Add live text or audio guidance ("Face found, move closer") through the existing assertive region. |
| A11Y-37 | Low | `app/image-dropzone.tsx:204-213` | When `maxFiles` is exceeded, the extra files are dropped silently. The "too many" and "unsupported" messages exist only in the `sr-only` status region. | Also show the message visibly, for example a small `Alert` under the dropzone. |
| MOB-10 | Low | `app/image-dropzone.tsx:422` | The per-file error replaces the file name in a single `truncate` line inside about 100 px tiles (3 columns on phones), so the reason can't be read. `title` holds the file name, not the error. | Use `line-clamp-3` for errors, or list errors below the grid. |

### 9. Video, try-on, together

| ID | Sev | Location | Issue | Fix |
|---|---|---|---|---|
| A11Y-38 | Low | `video/talking-video-form.tsx:83` | `aria-live="polite"` wraps the word, seconds and progress stats, which update on every keystroke, so screen readers announce them repeatedly while the user types. The same element is also the textarea's description. | Remove `aria-live` from the stats. Announce once when the user crosses the limit, through a separate status. |

### 10. Settings, billing, teams, API keys, admin, toasts

| ID | Sev | Location | Issue | Fix |
|---|---|---|---|---|
| A11Y-39 | Medium | `enhance/enhance-quick-actions.tsx:71-80`, `create/api-error-alert.tsx:97-100`, `providers/index.tsx:25` | Toasts that carry actions ("Open", "Buy credits") and important outcomes ("video ready", enhance failures) auto-dismiss after Sonner's default 4 seconds. Keyboard and screen-reader users often can't reach the action in time (2.2.1). | Set `duration: Infinity` (or 10 seconds or more) for toasts with an action, and mirror the outcome in persistent UI. |
| A11Y-40 | Low | `auth/api-keys-manager.tsx:330-360` | When a key is created, the form is replaced by the reveal view. Radix moves focus to the dialog container, and the new title isn't announced. | Focus the read-only key input or the new `DialogTitle` after the swap. |
| A11Y-41 | Low | `api-docs/endpoint.tsx:61`, `api-docs/schema-table.tsx:27` | `text-muted-foreground/80` measures 4.08:1 at 12 px. | Use `text-muted-foreground`. |
| MOB-11 | Low | `billing/plan-cards.tsx:63` | The yearly "N months free" badge is `hidden min-[380px]:inline-flex`, so it disappears at 360 px, the main target width. | Wrap the badge onto a second line instead of hiding it, or put the saving in the plan price text. |

---

## Verified OK

- **Language and zoom:** `<html lang>` comes from `DEFAULT_LOCALE`, and `global-error` sets `lang="en"`. The viewport doesn't block zoom (no `maximum-scale` or `user-scalable=no`). `-webkit-text-size-adjust: 100%`.
- **No iOS focus-zoom:** `Input` and `Textarea` use 16 px (`text-base md:text-sm`) on mobile, and the custom range and colour inputs aren't text fields.
- **Viewport units:** `dvh` is used throughout (`min-h-dvh`, `max-h-[calc(100dvh-2rem)]`, `70dvh` painter/viewer caps). The only `vh` is the dev-only email iframe.
- **Skip link:** present in the app, marketing, admin and shared layouts. It is the first focusable element, targets `<main id="main">`, and shows a solid ring on focus.
- **Landmarks:** one `<main>` per page across all shells and error pages. The navs are labelled and use `aria-current="page"`. Footers are `<footer>`.
- **Text contrast:** foreground, muted, primary, destructive, success, warning and brand-soft text tokens pass AA on their surfaces in both themes (table above). The `--input` border is ≥ 3:1 on the page background.
- **Reduced motion:** a global `prefers-reduced-motion` override near-zeroes animations and transitions. Decorative animations (`animate-ping`, the camera oval pulse, the countdown) are gated with `motion-safe:`. `create-studio` scroll respects the preference. Spinners stop after one cycle, but text and `aria-busy` still convey the state.
- **Dialogs, sheets and menus:** Radix primitives give focus trap, Escape, focus return, and title plus description, including `sr-only` descriptions on sheets. `ConfirmDialog` stays open while pending and blocks Escape during async work.
- **Wizard focus:** the model wizard moves focus to the step `<h1>` on every step change. The step list uses `aria-current="step"` with `sr-only` done/current text, and phones get "Step N of M".
- **Async job progress:** `JobProgress` is `role="status"`/polite. Batch progress has an `sr-only` summary status, and the progress bars have labels and `aria-valuetext`. Upload, prompt-helper and camera-countdown announcements exist. The viewer's score meters use `role="meter"`.
- **Toasts:** Sonner renders a polite live region with a close button and the Alt+T shortcut.
- **Before/after slider:** `role="slider"` with value and value text; arrow keys, PageUp/PageDown, Home and End; a 44 px handle; `touch-pan-y`, so the page still scrolls; a solid focus ring; tap-to-position, so no drag is needed.
- **Gallery selection:** tiles become toggle buttons with `aria-pressed` and a descriptive "Select image: …" label, plus a visible check and ring. A polite count is announced. "Select all" is still reachable on mobile through the menu. Hover-only actions appear on `focus-within` and are always visible on touch (`pointer-fine:` gating).
- **Icon-only buttons:** a scan of every `size="icon*"` button and raw `<button>` found none without `aria-label` or `sr-only` text. Decorative icons are `aria-hidden`.
- **Images:** generated media use the prompt, truncated, as alt text (cards and viewer, plus an `sr-only` "AI-generated photo, created …" figcaption). Decorative previews and avatars use `alt=""`. Public share images say "AI-generated photo" and don't leak the private prompt.
- **Forms:** labels are tied with `htmlFor`/`useId`. Radio cards use native inputs or Radix radio groups inside `fieldset`/`legend`. `autocomplete` is set for email, name and organisation, and `inputMode` for email and numeric fields. `aria-invalid` and `aria-describedby` are used on login, delete-account confirmation and the talking-video script. `ApiErrorAlert` focuses new errors. Pack size uses a native range input with `aria-valuetext`.
- **Tables:** `sr-only` captions plus `scope` on headers (admin, credit cost, API docs). The admin bar chart is `role="img"` with a full data-table fallback. Code samples are focusable `<pre>` elements with labels.
- **Error pages:** `error.tsx`, `app/error.tsx`, `global-error.tsx` (self-contained styles with a focus-visible outline and OS colour scheme), `not-found.tsx` and `s/[token]/not-found.tsx` all have an `<h1>`, explanatory text and recovery actions.
- **Mobile shell:** bottom-nav tabs are at least 44×52 px with `pb-safe` for the home indicator. `main` has `pb-28` to clear the nav. The sticky action bar has a spacer. The selection bar sits above the nav, including the safe area. Dialog content scrolls (`max-h` plus `overflow-y-auto`). The media picker body scrolls inside the dialog.
- **Native and Radix keyboard support:** Tabs and ToggleGroups (arrow keys), Select/combobox, `<details>`-based FAQ and API-docs TOC, drop zone with a button fallback and paste support.
- **Theme:** the theme toggle has an accessible name and the theme radio group sits in the user menu. Both themes keep tokens in sync, including the `color-scheme` and `theme-color` metas.
