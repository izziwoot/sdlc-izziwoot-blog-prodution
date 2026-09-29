# Diagrams

Diagrams are hand-authored inline SVG committed alongside the post. No Mermaid, no
build-time browser, no client-side renderer.

This reverses the intent document's "Mermaid rendered at build time" on cost
grounds (spec §10.8): build-time Mermaid normally means a headless browser in CI —
slow, fragile, and a large dependency for a site whose whole premise is minimalism.

## Rules

1. Use `currentColor` and the design tokens (`var(--fg)`, `var(--accent)`,
   `var(--border)`) for every stroke and fill. A hard-coded `#000` becomes
   invisible in dark mode, and nothing will warn you.
2. Give every diagram `role="img"`, a `<title>`, and a `<desc>`, wired up with
   `aria-labelledby`. The title names it; the desc explains what it shows to
   someone who cannot see it. A diagram without a desc is a picture of
   information, not the information.
3. Set `viewBox`, omit `width`/`height`, and constrain with CSS (`.diagram`).
   This scales without layout shift.
4. Keep it inline in the post when used once; extract to
   `src/components/diagrams/` when reused.

## Skeleton

```html
<svg viewBox="0 0 400 160" role="img" aria-labelledby="d-title d-desc" class="diagram">
  <title id="d-title">What the diagram is called</title>
  <desc id="d-desc">What it shows, in a sentence or two.</desc>
  <rect x="10" y="20" width="120" height="44" fill="none" stroke="var(--border)" />
  <text x="70" y="47" text-anchor="middle" fill="var(--fg)" font-size="13">Label</text>
</svg>
```

## Raster images

Use `Figure.astro`, never a raw `<img>` to `public/`. It emits AVIF with a WebP
fallback, explicit dimensions so nothing shifts, and requires `alt` at the call
site. Source files live in `src/assets/` so they are processed at build time.
