# Design System & AI Agent Specification: "Tactile Atmospheric Paper"

## 1. Role & Core Design Philosophy
**Agent Instruction:** You are an expert UI/UX Engineer and Motion Designer. When redesigning or building components for this project, apply the **"Tactile Atmospheric Paper"** aesthetic.

This style merges **digital precision** (clean sans-serif typography, iOS-inspired bottom sheets, pill buttons) with **physical, tactile warmth** (subtle creased paper textures, receipt-like perforated dividers, organic tilt angles, and fluid stateful micro-interactions).

### Core Pillars:
1. **Atmospheric Surfaces:** Rich, vibrant gradient backgrounds infused with subtle physical paper creases and grain—never flat, lifeless solid colors.
2. **Inline Contextual Richness:** Typography isn't just plain text; key entities (clients, statuses, documents) are embedded inline as mini-pills, badges, or interactive tokens.
3. **Single-Container State Morphing:** Actions do not trigger jarring page reloads or heavy popups. Instead, buttons morph in-place (e.g., Button $\rightarrow$ Interactive Slider/Signature Pad $\rightarrow$ Confirmation Trigger), and parent cards smoothly crossfade with spatial depthblur (`backdrop-filter` + `scale`).
4. **Playful Micro-Skeuomorphism:** Minimalist 3D/tactile iconography (like a slightly tilted, dog-eared document icon) that grounds the digital interface in the physical world.

---

## 2. Color Palette & Atmospheric Tokens

Use CSS custom properties (or Tailwind theme extensions) to implement this palette. The hallmark of this design is **white and translucent white hierarchy layered over a deep sky/cerulean blue textured canvas**.

### Surface & Background Tokens
* `--bg-canvas-light`: `#F4F7FB` (Outer app background behind modals/sheets)
* `--surface-primary-top`: `#3B82F6` (Vibrant Azure Blue - top of card gradient)
* `--surface-primary-bottom`: `#76A9FA` (Soft Sky Blue - bottom of card gradient)
* `--surface-primary-gradient`: `linear-gradient(180deg, #3882F6 0%, #5B9BF8 55%, #76A9FA 100%)`
* `--surface-glass-secondary`: `rgba(255, 255, 255, 0.14)` (Translucent fill for secondary buttons/containers)
* `--surface-glass-border`: `rgba(255, 255, 255, 0.28)` (1px specular border for glass elements)
* `--surface-solid-action`: `#FFFFFF` (Pure white for primary interactive CTAs)

### Typography & Content Tokens (On Blue Surface)
* `--text-primary`: `#FFFFFF` (100% White - Headings, primary values, strong emphasis)
* `--text-secondary`: `rgba(255, 255, 255, 0.65)` (Softened Sky White - Secondary phrasing, document codes, inline metadata)
* `--text-label`: `rgba(255, 255, 255, 0.50)` (Muted White - Small section labels like "Contact", "Project APR")
* `--text-on-solid`: `#111827` (Deep Charcoal/Black - Text & icons inside solid white primary buttons)

### Accent & Semantic Tokens
* `--accent-brand-pill`: `#FF6B4A` (Warm Coral/Orange - used for inline brand/entity avatars)
* `--semantic-success`: `#10B981` (Emerald Green - confirmation badges/checkmarks)
* `--divider-dashed`: `rgba(255, 255, 255, 0.22)` (Perforated receipt-style divider line)
* `--handle-bar`: `#5B9BF8` or `rgba(0, 0, 0, 0.15)` (Top sheet grabber pill)

---

## 3. The "Secret Sauce": Paper Texture & Lighting Effects

**Agent Instruction:** Do not render the primary blue container as a flat CSS color. You must layer **three visual effects** inside the main card/sheet container (`position: relative; overflow: hidden;`):

1. **Base Gradient:** Apply `--surface-primary-gradient`.
2. **Soft Specular Cloud/Crease Lighting:** Add radial gradients at `mix-blend-mode: overlay` or `soft-light` to simulate light hitting slightly uneven, folded heavy cardstock:
   ```css
   .paper-lighting {
     position: absolute;
     inset: 0;
     pointer-events: none;
     background:
       radial-gradient(circle at 15% 25%, rgba(255, 255, 255, 0.22) 0%, transparent 45%),
       radial-gradient(circle at 85% 65%, rgba(255, 255, 255, 0.15) 0%, transparent 50%),
       linear-gradient(125deg, transparent 40%, rgba(255, 255, 255, 0.08) 48%, rgba(0, 0, 0, 0.04) 52%, transparent 60%);
     mix-blend-mode: overlay;
   }
   ```
3. **SVG Noise / Paper Fiber Overlay:** Inject an inline SVG `<filter id="paper-grain">` with `feTurbulence` (`type="fractalNoise"`, `baseFrequency="0.8"`, `numOctaves="3"`) at `opacity: 0.045` over the entire card so it feels like dyed matte paper.

---

## 4. Typography & Inline Rich Text Architecture

* **Font Stack:** `'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif`
* **Letter Spacing:** Tight tracking on large text (`-0.025em`), normal tracking on labels (`-0.01em`).

### Typographic Scale & Rules:
1. **Editorial Statement Header (`1.375rem` / `22px`, `line-height: 1.35`, `font-weight: 500`):**
   * Mixes primary white text with muted secondary text in the same sentence flow to create visual hierarchy without extra layout boxes.
   * *Pattern:* `[Primary Action/Title in #FFF]` for `[Inline Brand Badge]` `[Brand Name in #FFF]` `[Document Type & ID in rgba(255,255,255,0.65)]` `[Inline Action Icon]`.
2. **Metadata Micro-Label (`0.8125rem` / `13px`, `font-weight: 500`, `color: var(--text-label)`):**
   * Placed `4px` above its corresponding data value.
3. **Primary Data Value (`1.375rem` / `22px`, `font-weight: 500`, `color: #FFF`):**
   * Used for names, assignees, or key text parameters.
4. **Financial / Metric Readout (`1.5rem` / `24px`, `font-weight: 600`, `font-variant-numeric: tabular-nums`):**
   * Format large numbers with spaces instead of commas for a clean European/modern fintech look (e.g., `$12 000.00`).

---

## 5. Signature Micro-Components & Small Elements

When building views in this style, incorporate these signature tactile details:

### A. Tactile Dog-Eared Document Icon
* **Visual:** A miniature vertical sheet of paper (`36px x 44px`, `border-radius: 6px`), colored soft off-white/grey (`linear-gradient(135deg, #FFFFFF 0%, #D1D5DB 100%)`).
* **The Fold:** Top-right corner is folded over (dog-eared) with a brighter highlight (`#FFFFFF`) and a subtle drop shadow cast onto the paper body.
* **Posture:** Always give it a slight organic tilt (`transform: rotate(-6deg)`) in its resting state, shifting to `rotate(-4deg) scale(1.08)` in the success state with a circular green checkmark badge (`#10B981` with a white border) anchored to the bottom-right corner.

### B. Inline Entity Badge (The "Brick inc." Pill)
* **Visual:** Whenever referencing a user, company, or workspace inside a heading, render an inline-flex squircle (`22px x 22px`, `border-radius: 6px`, `vertical-align: middle`, `margin: 0 4px`).
* **Styling:** White outer ring (`2px solid #FFFFFF`), warm coral fill (`#FF6B4A`), with a tiny inner white geometric motif.

### C. Inline Micro-Action Trigger
* **Visual:** Next to document IDs or secondary text (e.g., `ND327`), place a `16px x 16px` circular outline icon (`1.5px solid rgba(255,255,255,0.6)`) containing a downward arrow. Hovering brightens the opacity to `100%` and translates it `1px` down.

### D. Perforated Receipt Divider
* **Visual:** Never use a solid `<hr>`. Separate logical sections using a custom dashed line that mimics perforated tear-off paper:
  ```css
  .perforated-divider {
    width: 100%;
    height: 1px;
    background-image: linear-gradient(to right, rgba(255, 255, 255, 0.25) 55%, transparent 45%);
    background-position: bottom;
    background-size: 12px 1.5px;
    background-repeat: repeat-x;
    margin: 18px 0;
  }
  ```

### E. Dual Pill Action Bar
* Bottom of the container features a 2-column grid (`grid-template-columns: 1fr 1fr; gap: 12px`).
* **Height:** `52px`, fully rounded pill (`border-radius: 9999px`).
* **Secondary Button ("Cancel"):** Translucent glass (`background: var(--surface-glass-secondary)`), `border: 1px solid var(--surface-glass-border)`, `backdrop-filter: blur(8px)`, white text (`font-weight: 500`).
* **Primary Button ("Sign" / "Back to Docs"):** Solid `#FFFFFF` surface, subtle ambient shadow (`0 4px 12px rgba(0, 0, 0, 0.08)`), dark text (`#111827`, `font-weight: 600`).

---

## 6. Animation & Interaction Choreography

**Agent Instruction:** Use spring physics (via Framer Motion, GSAP, or CSS `cubic-bezier(0.22, 1, 0.36, 1)`) for all state transitions. Never use linear or abrupt transitions.

### Interaction Sequence (The 3-Stage Action Flow):

#### Stage 1: Resting Overview State
* All metadata (Header, Contact, Divider, Amount) is fully visible (`opacity: 1`, `filter: blur(0px)`, `transform: scale(1)`).
* Primary right-hand pill button shows `[ ✍️ Sign ]`.

#### Stage 2: In-Place Interactive Capture (Morphing Button)
* **Trigger:** User clicks/drags the primary `[ ✍️ Sign ]` button.
* **Track Reveal:** A circular white thumb knob (`42px x 42px` with a soft grey border/shadow) slides from left to right inside the pill button (`translateX`), acting as a tactile swipe-to-sign / draw sweep.
* **Signature Stroke Animation:** As the knob reaches the right edge (or upon tap), an SVG vector signature path animates in the center of the white pill using `stroke-dashoffset` animation (`duration: 450ms`, `ease-out`), while a faint horizontal baseline appears underneath the signature.

#### Stage 3: Spatial Depth Transition to Success State
* **Trigger:** Immediately after the signature stroke completes (~300ms pause for visual confirmation).
* **Background Content Recession:** Instead of disappearing abruptly, the entire form body (Header, Contact, Divider, Price) transitions over `500ms`:
  * `opacity: 1` $\rightarrow$ `0`
  * `filter: blur(0px)` $\rightarrow$ `blur(12px)`
  * `transform: scale(1) translateY(0)` $\rightarrow$ `scale(0.96) translateY(-8px)`
* **Centered Confirmation Emergence:** Simultaneously, the centered Success View transitions in from the foreground (`opacity: 0` $\rightarrow$ `1`, `filter: blur(8px)` $\rightarrow$ `blur(0px)`, `scale(0.92)` $\rightarrow$ `scale(1)`):
  * Features the tilted 3D Paper Icon with the green checkmark badge (`scale(0)` $\rightarrow$ `scale(1)` with a bouncy spring `stiffness: 400, damping: 18`).
  * Two-line centered confirmation message (`"Agreement ND327\nis successfully signed"`, `font-size: 1.25rem`, `text-align: center`).
* **Button Label Crossfade:** Inside the primary white pill button, the drawn signature vertically crossfades (`translateY(-10px)`, `opacity: 0`) as the new label `"Back to Docs"` rises into place (`translateY(10px)` $\rightarrow$ `0`, `opacity: 1`).

---

## 7. Open-Ended Adaptation Guide (How to Apply to Any Project)

When asked to redesign any existing screen, component, or workflow in the user's project using this markdown guide, follow this mapping strategy:

1. **Convert Standard Modals, Drawers & Cards into "Atmospheric Sheets":**
   * Replace white/dark cards with the rounded bottom-sheet/card architecture (`border-radius: 36px`, `padding: 28px 24px`), topped with a subtle drag handle (`36px x 4px` pill), and wrap the primary focal card in the **Tactile Blue Paper Gradient + Texture**.
2. **Transform Multi-Field Readouts into Conversational Headers:**
   * If a project has dull key-value rows (e.g., *Project: Redesign*, *Client: Brick Inc*, *ID: ND327*), combine them into a single **Editorial Statement Header** with inline entity badges and secondary-opacity IDs.
3. **Replace Standard Dividers with Perforated Lines:**
   * Use the `.perforated-divider` pattern between key data groups to evoke physical invoices, tickets, or contracts.
4. **Upgrade Destructive/Confirmations to In-Place Pill Morphing:**
   * Instead of opening a second "Are you sure?" modal or redirecting to a separate thank-you page, keep the user inside the same card. Use the **Primary Pill Button** for progressive interaction (Swipe/Click $\rightarrow$ Micro-Animation inside the button $\rightarrow$ Blur-fade the card body into a centered celebratory icon + message).
5. **Add Tactile Micro-Icons:**
   * Pair headings or empty/success states with slightly rotated (`-6deg`), soft-shaded 3D/tactile vector icons (documents, folders, tickets, cards, or coins depending on the domain).

---

## 8. Reference Implementation Blueprint (HTML/CSS/JS Skeleton)

Use this structural and styling reference as your baseline when generating code for components in this project:

```html
<!-- Atmospheric Sheet Card Structure -->
<div class="tactile-sheet-wrapper">
  <div class="sheet-grabber"></div>

  <div class="atmospheric-blue-card" data-state="overview">
    <!-- Lighting & Texture Overlays -->
    <div class="paper-lighting"></div>

    <!-- VIEW 1: Overview Content (Blurs & fades out on completion) -->
    <div class="card-content-overview">
      <div class="tactile-doc-icon"></div>

      <h2 class="editorial-heading">
        Redesign discovery phase for
        <span class="inline-entity-badge"></span>
        Brick inc.
        <span class="muted-meta">Agreement ND327 <button class="inline-icon-btn">↓</button></span>
      </h2>

      <div class="data-group">
        <span class="data-label">Contact</span>
        <div class="data-value">Phil Norman</div>
      </div>

      <div class="perforated-divider"></div>

      <div class="data-group">
        <span class="data-label">Project APR</span>
        <div class="data-metric">$12 000.00</div>
      </div>
    </div>

    <!-- VIEW 2: Success Overlay (Blurs & scales in on completion) -->
    <div class="card-content-success" aria-hidden="true">
      <div class="tactile-doc-icon with-check">
        <span class="check-badge">✓</span>
      </div>
      <p class="success-title">
        Agreement ND327<br/>is successfully signed
      </p>
    </div>

    <!-- Persistent Bottom Dual Pill Action Bar -->
    <div class="action-pill-bar">
      <button class="pill-btn pill-btn-secondary">Cancel</button>
      <button class="pill-btn pill-btn-primary">
        <!-- Dynamically morphs between: "Sign" -> Signature SVG -> "Back to Docs" -->
        <span class="btn-state-text">✍️ Sign</span>
      </button>
    </div>
  </div>
</div>
```
