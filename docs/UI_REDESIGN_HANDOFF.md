# Tijori UI redesign handoff

## Integration contract

`codex/ui-redesign` is a visual reference, not an authoritative implementation of the product. The user explicitly wants **only cosmetic UI changes** reused on another branch. Preserve the destination branch's functionality, architecture, security limitations, and contributor instructions.

Do not merge this branch wholesale, cherry-pick its history wholesale, replace the destination application controller, or import its older backend merely to obtain the design. Rebuild or selectively adapt the presentation around the destination's existing props, callbacks, state, validation, routes, and lifecycle. A visual redesign is not permission to change product behavior.

This document records the local redesign reviewed on 2026-11-07 against branch base `08e682c`. The documentation commit does not commit the existing UI working files. At handoff, several design components and route files were still untracked and other UI edits were uncommitted. Check `git status` and the actual source revision before using this guide from another checkout: **a pushed documentation commit alone does not contain the visual implementation**. Preserve that work separately before changing or cleaning this checkout; never reset, clean, or drop stashes to prepare a port.

## Visual direction to retain

- Display name **Tijori**, without the trailing dot; a small outlined treasure chest inside the tilted paper brand mark. Keep existing internal API/package identifiers unless separately authorized to rename them.
- DM Sans typography, generous spacing, large tightly tracked headings, conversational copy, and a light canvas (`--bg-canvas-light: #f4f7fb`).
- Atmospheric blue paper surfaces using the existing gradient (`#3882f6`, `#5b9bf8`, `#76a9fa`), soft lighting, restrained grain, rounded cards, white form interiors, and dashed receipt-like dividers.
- Pill buttons: blue primary (`#2868d2`), white primary on blue surfaces, and translucent secondary. Maintain visible focus, disabled, busy, and error states.
- Compact pale-blue/white MicroSlats background. The purple/black example palette and the CrystalizedBall experiment were rejected; the original small sparkle was restored.
- Responsive signup presentation: two columns on wide screens, stacked content on phones, scrollable step content, and an anchored primary action where space permits.
- Landing composition inspired by Longitude's oversized type, overlapping compositions, and spacious editorial sections, adapted to Tijori's palette. It is not a request to copy the reference site's assets or business claims.

`tactile_atmospheric_blue_design_system.md` is a supplementary visual reference. The actual approved UI and the destination's accessibility and functionality take precedence over its generic recipes, example copy, and motion prescriptions.

## Source map: what can be reused

| Source | Reusable presentation | Porting boundary |
| --- | --- | --- |
| `app/components/Brand.tsx` | Treasure chest SVG, paper mark, Tijori wordmark | Adapt its home link to the destination's routes. |
| `app/landing.css` | Landing composition, responsive layout, illustration styling, buttons, typography | Keep styles scoped; resolve destination token and selector collisions. |
| `app/page.tsx` | Marketing section markup and illustrative vault, object, approval, and signal compositions | This branch assigns `/` to the landing page. Do not overwrite an existing destination page or adopt its CTA URLs automatically. Example people and approvals are illustrations, never live state. |
| `app/components/LandingMotion.tsx` | Once-per-appearance illustration choreography and scroll reveals | Browser presentation only. Keep observer/listener/animation cleanup and keyboard/reduced-motion behavior. |
| `app/components/AuthAtmosphere.tsx`, `MicroSlats.jsx`, `MicroSlats.css`, `MicroSlats.d.ts` | Optional blue WebGL background | Cosmetic dependency is `ogl`; keep browser-only loading, a CSS fallback, bounded texture sizes, visibility handling, and reduced-motion support. Never gate an action on WebGL. |
| `app/components/JourneyIntro.tsx` | Signup layout wrapper | Presentational wrapper only; bind to the destination's existing UI state. |
| `app/components/InputMode.tsx` | Pointer/keyboard modality for decorative motion | Reuse the destination's modality mechanism when one exists; avoid duplicate global listeners. |
| `app/components/FlowPanel.tsx` | Short directional chapter transitions and pinned-action layout | Also performs focus and scroll management. Adapt those intentionally to the destination's fields and navigation; do not copy it as an inert visual wrapper. |
| `app/globals.css` | Blue tokens, paper textures, brand/form/button styling, responsive layouts, motion styles | Mixed global stylesheet. Select relevant rules; never replace the destination stylesheet wholesale. Preserve its resets, safe areas, accessibility rules, selectors, and unrelated screens. |

The landing narrative is: hero and illustrative vault → shared-space introduction → object identity, group decisions, and cooperative audio vignettes → three-step introduction → prototype limitations → final signup invitation. Preserve accurate limitations and adapt the narrative to capabilities actually present in the destination branch.

## Mixed files: reference only, not drop-in replacements

- **`app/components/TijoriApp.tsx`** contains the older app controller moved from the original `app/page.tsx`, alongside redesign markup. It includes storage loading, remembered identity selection, session state, polling, mutation requests, Safe deployment/recovery, balances, and acoustic checks. Extract visual structure only. Never replace the destination controller with it.
- **`app/components/ObjectIdentityForm.tsx`** mixes styling with a new local `identity → object → review` UI sequence, Back/Next handling, Enter behavior, remembered-name read-only behavior, feature clearing, and capture mounting/unmounting. Keep the destination's enrollment/login requirements, number of views, categories, retry decisions, profile versions, matching thresholds, pending identity handling, and key wrapping. Fit the visual stepper around those requirements; do not replace them with this branch's single-capture flow or fixed step counts.
- **`app/components/ObjectCapture.tsx`** has copy/legend/consent-presentation edits. Transfer appropriate wording only. Retain the destination's consent, camera, foreground isolation, workers, matching, validation, retry, and cleanup logic, and all accurate privacy/threat-model disclosures.
- **`app/layout.tsx`** combines typography, metadata, viewport configuration, modality mounting, and local feedback tooling. Adapt visual metadata/fonts and accessible viewport settings selectively; retain destination providers, session/auth wrappers, and global integrations.
- **`app/app/page.tsx`, `app/signup/page.tsx`, `app/login/page.tsx`** are this preview's route wrappers. They initialize signup/login mode and route to `TijoriApp`. Routing and startup-mode behavior are not cosmetic changes. Use the destination's routes, navigation, redirects, and session behavior. Get separate authorization before changing that structure solely to match this preview.
- **Native dialogs in `TijoriApp.tsx`** replace prior modal markup and introduce `showModal()`, Escape/cancel handling, focus boundaries, backdrop interactions, and body scroll locking. Reuse the visual appearance on the destination's accessible dialog implementation; review interaction semantics separately.
- **`package.json` / `package-lock.json`** contain the cosmetic `ogl` addition and local `agentation` tooling. Add only dependencies actually needed for retained visual components, using the destination's package manager and lockfile. Never replace either file with this branch's copy.

## Explicitly excluded from the UI port

Do not import changes to `app/api/**`, `lib/**`, `contracts/**`, model preparation/runtime assets, storage adapters, database schemas or migrations, signing/relayer logic, authentication, matching policies, transaction authorization, approval/quorum rules, state versions, or persistence limits. Do not import historical functional commits from the redesign branch's ancestry.

In particular, this branch's on-disk guide describes an older aggregate version and older object identity flow. Those descriptions must not downgrade a destination with newer migrations, multi-view profiles, matching policies, or treasury functionality. Keep the destination's `AGENTS.md`, API documentation, and product contracts authoritative; transfer only the UI-port instruction/link from this guide, not the source branch's entire contributor guide.

Never copy `.env*`, secrets, encryption keys, journals, budgets, state files, browser identities, photos, masks, recovery exports, or contents of `data/`. Never change storage mode, reset state, remove locks, delete history, increase aggregate limits, or change validation to make the UI preview succeed. Never imply the object or audio demos provide secure authentication, custody, or proof of proximity.

`app/components/DevelopmentFeedback.tsx`, its `app/layout.tsx` wiring, and the `agentation` dependency are local review tools, not part of the reusable design. The file itself says to keep it and its wiring out of commits. Local `.agents/skills/**`, generated `.next*` directories, caches, certificates, and build/type artifacts are also excluded.

## Motion contract

Use the existing `--ease-out` and `--ease-in-out` tokens and CSS/WAAPI before adding a motion dependency. Animate transforms and opacity; do not animate layout properties, introduce perpetual decorative loops, or move real financial data while it is being read.

- Guided signup content: 200 ms directional entrances, 35 ms stagger capped at 70 ms; actions remain anchored. Progress fills use a 240 ms transform transition.
- Landing: staged hero receipt and member/approval entrances; a single decorative object scan sweep; staggered illustrative approvals; one expansion of the signal rings; staggered introduction steps; final invitation reveal. These explanatory scenes play once when the illustration itself enters view, including on narrow screens.
- Preserve keyboard bypass, reduced-motion alternatives, fine-pointer hover gating, interruption cleanup, and pausing decorative animations when the document is hidden. Scene completion must not submit a form, toggle consent, start a microphone/camera, mark an actual check successful, or authorize anything.

## Integration procedure

1. Start from the intended destination branch and read its current instructions. Record its routes, data contracts, and required flows before editing.
2. Inspect both the committed source and any still-uncommitted design files. Use this source map to select presentation pieces; do not assume every file on this branch is safe to copy.
3. Integrate tokens and scoped visual components first. Adapt the landing CTAs and brand links to existing routes. Keep preview/sample data explicitly illustrative and separate from live application state.
4. Restyle the destination's existing functional components in place. Keep their callbacks, payloads, disabled/validation conditions, consent, busy/error handling, and storage/security behavior intact. Resolve newer functionality by adapting the design to it.
5. Review the final diff for changes in behavior, not just paths. Any proposed noncosmetic change needs a separate explanation and authorization; leave it out of a UI-only port.
6. Run the destination's lint/type checks, `npm run build`, and relevant checks; build before `npm test` where required by its instructions. Verify navigation, focus/keyboard use, reduced motion, responsive layout, overflow, and existing business flows. Real-phone testing is still required for device-specific behavior.
7. Commit cosmetic changes separately from any independently authorized functional work. Report exact validation limits. Do not publish, push, deploy, or expose the unauthenticated app unless the user authorizes that action.

## Validation recorded for this local design session

- Landing, signup, login, and app routes returned HTTP 200. Desktop landing/signup presentation was inspected in Chrome, and a 390 px responsive preview was used to identify mobile layout issues. This is not real-phone verification or a claim that every motion sequence was visually verified.
- Targeted ESLint and a temporary source-only TypeScript check passed. That check excluded stale generated outputs and local data scripts; it is not a successful standard production build.
- `npm run build` compiled the production bundle but failed type checking in stale `.next-phone/dev/types/validator.ts` route references and `data/arkiv-migration-readback.ts` references to modules/types absent from this branch. Do not transfer those artifacts or treat the failure as a reason to change destination product code.
- Live signup continuation was blocked by the existing Arkiv writer busy/stopped-lock error (503). No lock, journal, state, key, or spending allowance was reset to bypass it. Full signup/login, matching, approval, and on-chain flows were not verified by this design session.
