---
name: TaniNote
description: Open any study file and write on it, in the browser, on any device.
colors:
  navy: "#262b4a"
  navy-raised: "#353b61"
  navy-ink: "#eef0fa"
  navy-muted: "#b3b8d6"
  cream-ground: "#fdf0c6"
  panel: "#ffffff"
  soft: "#eef2fb"
  surface-2: "#f5f6fa"
  text: "#232744"
  muted: "#5d6384"
  line: "#e3e6ef"
  line-strong: "#cbd0df"
  welcome-yellow: "#f2c94c"
  yellow-deep: "#e0b43c"
  stat-cyan: "#bdeef0"
  stat-lilac: "#d9daf5"
  stat-pink: "#f4c3cd"
  peach: "#fbdcae"
  peach-soft: "#fdebd0"
  danger: "#c0352e"
  desk: "#f2eee4"
  swipe-yellow: "#ffe14d"
  pen-graphite: "#23262b"
  pen-blue: "#2257d6"
  pen-red: "#d83a34"
  pen-green: "#1f8a4c"
  pen-violet: "#6d3fd1"
  hl-pink: "#ff9ccd"
  hl-green: "#8eed98"
  hl-blue: "#86ceff"
  hl-orange: "#ffb866"
typography:
  display:
    fontFamily: "Iowan Old Style, Palatino Linotype, Palatino, Book Antiqua, Georgia, serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Iowan Old Style, Palatino Linotype, Palatino, Book Antiqua, Georgia, serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.005em"
  stat-numeral:
    fontFamily: "Iowan Old Style, Palatino Linotype, Palatino, Book Antiqua, Georgia, serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1
    fontFeature: "tnum"
  body:
    fontFamily: "Avenir Next, Avenir, Nunito Sans, Segoe UI, -apple-system, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  title:
    fontFamily: "Avenir Next, Avenir, Nunito Sans, Segoe UI, -apple-system, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.4
  label:
    fontFamily: "Avenir Next, Avenir, Nunito Sans, Segoe UI, -apple-system, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.3
  reading:
    fontFamily: "Iowan Old Style, Palatino Linotype, Palatino, Book Antiqua, Georgia, serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.62
rounded:
  sheet: "3px"
  sm: "8px"
  control: "10px"
  md: "12px"
  tool-group: "13px"
  lg: "16px"
  dialog: "20px"
  xl: "24px"
  frame: "30px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "16px"
  lg: "22px"
  xl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.panel}"
    rounded: "{rounded.control}"
    padding: "0 18px"
    height: "42px"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "0 18px"
    height: "42px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-2}"
  button-small:
    rounded: "9px"
    padding: "0 13px"
    height: "34px"
  nav-item:
    textColor: "{colors.navy-muted}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "44px"
  nav-item-active:
    backgroundColor: "{colors.stat-pink}"
    textColor: "{colors.text}"
  chip:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "34px"
  chip-selected:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.panel}"
  input:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "44px"
  search-field:
    backgroundColor: "{colors.navy-raised}"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "42px"
  welcome-hero:
    backgroundColor: "{colors.welcome-yellow}"
    textColor: "{colors.text}"
    typography: "{typography.display}"
    rounded: "{rounded.lg}"
    padding: "26px 22px 26px 28px"
  card:
    backgroundColor: "{colors.soft}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "20px 22px"
  stat-card-cyan:
    backgroundColor: "{colors.stat-cyan}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "16px 18px"
  stat-card-lilac:
    backgroundColor: "{colors.stat-lilac}"
    rounded: "{rounded.md}"
  stat-card-pink:
    backgroundColor: "{colors.stat-pink}"
    rounded: "{rounded.md}"
  today-card-head:
    backgroundColor: "{colors.peach}"
    textColor: "{colors.text}"
    padding: "14px 14px 8px"
  tool-group:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.tool-group}"
    padding: "0 5px"
    height: "46px"
  tool:
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    width: "42px"
    height: "36px"
  toast:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.panel}"
    rounded: "{rounded.md}"
    padding: "12px 18px"
---

# Design System: TaniNote

## Overview

**Creative North Star: "The Study Planner Desk"**

TaniNote is a friendly study dashboard set inside a dark navy frame. A cream ground surrounds a rounded navy shell; the sidebar lives on the navy, and the work lives on one white panel inset into it. On that panel, colour is given in soft pastel blocks: a yellow welcome hero, cyan, lilac and pink stat cards, and a peach "Today's study" planner card. Headings are bold serif, everything else is a warm humanist sans. The feel is a tidy planner page: cheerful, rounded, clearly organised, never loud.

The writing surface is the viewer layer of the same system. When a file opens, the dashboard gives way to a warm desk (`desk`) with white paper sheets on it and a frosted toolbar of white tool groups. The navy recedes there to a single selection colour, and the ink palettes (pens and highlighters) carry the colour. This follows the product principle that the material leads and the chrome recedes.

Dark mode inverts the frame, not the idea. Navy deepens, the panel turns to dark indigo, the pastels drop to muted deep tints, and yellow (`welcome-yellow`) replaces navy as the selected-state fill.

**Key Characteristics:**
- Navy shell frame (30px corners) on cream, one white panel (24px corners) inside it.
- Pastel colour blocks that each name one job: yellow welcome, cyan/lilac/pink stats, peach planner.
- Bold serif headings and numerals over a humanist sans body.
- Navy is the selected/primary state everywhere in light mode; yellow in dark mode.
- Viewer layer: warm desk, white sheets, frosted chrome, ink colour from the pen palettes.

## Colors

A navy-and-cream frame holding pastel blocks on white, with saturated ink kept for the writing surface.

### Primary
- **Planner Navy** (`navy`): the shell frame, sidebar, mobile tab bar, primary buttons, selected chips, segmented controls, switches, calendar selection, toasts, and stat-card icon tiles. In dark mode `--primary` becomes Welcome Yellow.
- **Raised Navy** (`navy-raised`): search field and top-bar icon buttons sitting on the navy frame.

### Secondary
- **Welcome Yellow** (`welcome-yellow`): the dashboard hero block, text selection, storage bars, search focus ring. Deep Yellow (`yellow-deep`) marks session dots in the month grid and the hero illustration's shapes.

### Tertiary
- **Stat Cyan, Stat Lilac, Stat Pink** (`stat-cyan`, `stat-lilac`, `stat-pink`): one per dashboard stat card. Pink also fills the active sidebar item.
- **Planner Peach** (`peach`, `peach-soft`): the "Today's study" card only: head band, week strip, card border, session dividers, dashed add-session button.

### Neutral
- **Cream Ground** (`cream-ground`): page ground around the navy shell on desktop.
- **Panel White** (`panel`): the main content panel, menus, dialogs, inputs, viewer tool groups.
- **Soft Wash** (`soft`): cards and settings cards on the panel.
- **Ink Navy Text** (`text`) and **Muted** (`muted`): body and secondary text.
- **Line** / **Line Strong** (`line`, `line-strong`): dividers and control borders.
- **Desk** (`desk`): viewer background behind paper sheets.
- **Danger** (`danger`): destructive menu items and confirm buttons.

### Ink (viewer layer)
- **Pens** (`pen-graphite`, `pen-blue`, `pen-red`, `pen-green`, `pen-violet`) and **Highlighters** (`swipe-yellow`, `hl-pink`, `hl-green`, `hl-blue`, `hl-orange`), defined in app.js `PENS`/`HLS`. Highlighter hues are reused as the file-kind marks (PDF pink, Word blue, Slides orange, EPUB green, Image yellow; Notebook `#c9b8ff`, text formats `#b9e4f0`).

### Named Rules
**The One Block, One Job Rule.** Each pastel names one dashboard job (yellow = welcome, cyan/lilac/pink = stats, peach = today's plan). Don't reuse a pastel as a generic card fill.

**The Navy Selects Rule.** Selected and on states (chips, segments, switches, chosen day, done check) fill with navy in light mode and Welcome Yellow in dark. No other colour marks selection.

## Typography

**Display Font:** Iowan Old Style (with Palatino, Georgia, serif fallbacks)
**Body Font:** Avenir Next (with Avenir, Nunito Sans, Segoe UI, system sans fallbacks)
**Label/Mono Font:** ui-monospace stack, only for code inside converted documents.

**Character:** A bookish bold serif for headings and numbers against a rounded, friendly sans for everything you operate. Both are system stacks; no webfont is vendored.

### Hierarchy
- **Display** (700, 34px, 1.1; 28px on phones): the welcome hero heading. Empty-state heading scales clamp(32px, 5vw, 48px).
- **Headline** (700, 22px, 1.2): card, dialog, calendar and agenda headings; page titles grow to 30px (26px on phones), settings cards 20px.
- **Stat Numeral** (700, 30px, 1, tabular): stat card values.
- **Title** (600, 15px): row names, buttons, field labels (14px).
- **Body** (400, 15px, 1.5): interface text; hero copy 15.5px capped at 46ch.
- **Label** (600, 12.5-13.5px): dates, stat captions, meta lines, page indicator.
- **Reading** (400, 17px serif, 1.62): converted documents (Word, EPUB, Markdown, HTML) inside an 800px flow column; their headings switch to the sans.

### Named Rules
**The Serif Speaks First Rule.** Serif is for headings, the brand name, the avatar initial, stat numerals and document title. Controls, labels and body copy stay in the sans.

## Layout

Desktop: a navy shell with 16px margin on the cream ground, split into a 232px sidebar and a main column (60px top bar over a scrolling white panel with 24px padding). The dashboard is a two-column grid (fluid main + 300px side column, 22px gap); main stacks hero then recent files, side stacks three stat cards then the Today card.

Breakpoints: at 1180px the side column moves below and the stat cards sit three across; at 980px the sidebar collapses to a 76px icon rail and the hero illustration is hidden; at 760px the shell goes full-bleed navy, the sidebar becomes a bottom tab bar, the panel gets 22px top corners only, and the file grid drops to two columns.

The file grid auto-fills 168px-minimum columns with 28px/22px gaps. Spacing is hand-set rather than stepped from one scale; observed values cluster around 6, 10, 16, 22 and 28px.

Viewer: full-screen desk, a frosted top bar (title row plus a horizontally scrolling toolbar that fades at its edges on overflow), and centred sheets stacked with 22px gaps.

## Elevation & Depth

Mostly tonal. The panel, cards and pastel blocks sit flat against each other; depth comes from the navy frame around the white panel. Shadows are soft, navy-tinted and ambient, kept for things that float or represent paper.

### Shadow Vocabulary
- **Frame** (`box-shadow: 0 30px 60px -20px rgb(120 90 20 / 0.35)`): the navy shell on cream only.
- **Small** (`box-shadow: 0 1px 2px rgb(38 43 74 / 0.08), 0 2px 6px rgb(38 43 74 / 0.06)`): button hover, recent thumbnails, favourite star.
- **Paper** (`box-shadow: 0 1px 2px rgb(38 43 74 / 0.10), 0 6px 20px rgb(38 43 74 / 0.08)`): file thumbnails and viewer sheets.
- **Medium** (`box-shadow: 0 2px 4px rgb(38 43 74 / 0.06), 0 12px 32px rgb(38 43 74 / 0.12)`): menus, dialogs, toast, hovered thumbnail.

### Named Rules
**The Paper Floats, Cards Don't Rule.** Cards and stat blocks have no shadow. Paper (thumbnails, sheets) and floating layers (menus, dialogs, toasts) do.

## Shapes

Rounded throughout, nested from big to small: frame 30px, panel 24px, dialog 20px, hero and cards 16px, stat cards, Today card, menus and thumbnails 12px, controls 10px, small buttons and selects 9px, menu rows 8px, session checkbox 7px. Chips, swatches, switches and day numbers are full pills or circles. Paper sheets keep a near-square 3px corner so they read as paper, not cards. The radius range (3px to 30px) is a hand-tuned set; only `--r-sm/md/lg/xl` exist as tokens.

The welcome hero carries an inline SVG composition (stacked rotated note sheets, a pen, deep-yellow bars). It is one illustration, not a reusable icon or pattern system.

## Components

### Buttons
- **Shape:** gently rounded (10px), 42px tall; small variant 34px with 9px corners.
- **Primary:** navy fill, white text, no border, 600 weight, optional 18px Phosphor icon.
- **Secondary:** white with a strong-line border; hover moves to `surface-2` with the small shadow.
- **Ghost:** translucent white (55%) used on the yellow hero; 80% on hover.
- **Press:** scale(0.97) with the ease-out curve. Disabled at 50% opacity.
- **Icon buttons:** 36px square, transparent, hover and press tints of navy (6% / 11%).

### Chips
- **Style:** pill, white, strong-line border, muted 600 text.
- **State:** selected fills navy with white text (yellow in dark). Hover darkens text and border.

### Cards / Containers
- **Card:** soft wash fill, 16px corners, 20px 22px padding, serif headline row with an optional inline sort select.
- **Stat card:** pastel fill, 12px corners, 44px navy icon tile (11px corners) beside a serif numeral and caption.
- **Today card:** white body inside a 1px peach border; peach head band, peach-soft week strip, peach-ruled session list, dashed peach add button.
- **Recent row:** index, 60px rounded thumbnail, two-line name with date, then tabular stats; hover tint, no border.

### Inputs / Fields
- **Style:** 44px, white, strong-line border, 10px corners. Search on navy uses Raised Navy with no border.
- **Focus:** 2px navy outline (yellow in dark); the navy search shows a 2px yellow ring.
- **Segmented control:** white track with border, navy selected segment. **Switch:** 40x24 track, navy when on.

### Navigation
- **Sidebar:** brand (serif, two lines) then 44px nav items in muted navy-ink; active item fills Stat Pink with dark text. Hover is a 6% white tint.
- **Mobile:** fixed navy tab bar, four tabs, active tab icon in pink.

### File Card
Portrait thumbnail (1:1.3, 12px corners, paper shadow) that lifts 3px on hover, with a two-line name and a meta line led by the kind mark: a bold 11.5px label sitting on a highlighter swipe in its kind colour.

### Viewer Toolbar (signature)
White tool groups (46px, 13px corners, line border) on a frosted bar (`rgb(255 253 247 / 0.86)`, 20px blur). Tools are 42x36, muted until selected. Under the active tool slides the **nib**: a 30x6 bar in the current ink colour, gliding 220ms. Ink swatches are 20px dots (highlighters are 22x14 rounded bars); the selected one scales up with a ring in its own colour. A size dot previews stroke width beside a range slider. Paper styles (lined, grid, dots, blank) are CSS-drawn on white sheets.

## Do's and Don'ts

### Do:
- **Do** put new dashboard content on the white panel inside the navy shell; the cream ground only shows around the frame.
- **Do** use the serif at 700 for headings and numbers, and the sans for everything operable.
- **Do** mark selection with navy (light) / Welcome Yellow (dark) and nothing else.
- **Do** keep paper white with the paper shadow and 3px corners, in both themes.
- **Do** take ink and kind colours from the pen and highlighter palettes; the highlighter swipe is the system's native emphasis mark.
- **Do** honour reduced motion and reduced transparency (the viewer bar turns solid).

### Don't:
- **Don't** give cards or pastel blocks a shadow; shadows belong to paper and floating layers.
- **Don't** introduce a new pastel or reuse one outside its job.
- **Don't** let viewer chrome compete with the page: no pastel blocks or navy fills in the toolbar beyond the selection states.
- **Don't** hard-code navy or pastel hexes in new CSS; use the custom properties so dark mode follows.
