// Appearance: three independent axes.
//
//   theme   — structure, typeface, shape.  Never a hue.
//   palette — hue, and the same set of hues in every theme.
//   mode    — surface polarity.
//
// Four themes × five palettes × two resolved modes = 40 combinations, and none
// of them can conflict, because the three layers own disjoint sets of tokens.
//
// This file is the source of truth for the hues. `styles/theme.css` declares the
// same values as custom properties; `appearance.test.ts` reads the sheet back
// and fails if the two ever drift apart. Everything here is pure — no DOM, no
// storage — so the contrast check is an ordinary domain test.

export const THEME_IDS = ['halo', 'telemetry', 'terrain', 'transit'] as const
export const PALETTE_IDS = ['indigo', 'lagoon', 'ember', 'orchid', 'phosphor'] as const
export const MODE_IDS = ['system', 'light', 'dark'] as const

export type ThemeId = (typeof THEME_IDS)[number]
export type PaletteId = (typeof PALETTE_IDS)[number]
export type ModeId = (typeof MODE_IDS)[number]
/** What `system` becomes once prefers-color-scheme has been consulted. */
export type ResolvedMode = 'light' | 'dark'

export interface Appearance {
  theme: ThemeId
  palette: PaletteId
  mode: ModeId
}

/** Halo · Indigo · System — Halo · Indigo · Dark is today's app, pixel for pixel. */
export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'halo',
  palette: 'indigo',
  mode: 'system',
}

export interface Palette {
  name: string
  blurb: string
  /** Primary fill: active tab, primary button, meter, timed items. */
  accent: string
  /** Secondary fill: events, habits, blocks, the Inbox badge. */
  accent2: string
  /** Text drawn ON an accent fill. */
  accentInk: string
  accent2Ink: string
  /**
   * The accent darkened for use as *type* on a pale surface. Phosphor green as
   * body text on near-white fails contrast; the same green as a fill under
   * --accent-ink passes. This is the only fork between modes inside a palette.
   */
  accentDeep: string
  /**
   * …and the same darkening for the two marks that carry no text of their own:
   * the secondary (events, blocks) and the completion colour. A bare mark has
   * nothing to be read against but the surface, so on paper it has to be the
   * deep twin or it disappears — bright accent on a light track measures about
   * 1.1–2.6:1, well under the 3:1 that non-text UI needs.
   */
  accent2Deep: string
  /** Completed: the tick, the habit dot, the done pip. */
  done: string
  doneInk: string
  doneDeep: string
  /** Warm "due soon" — a fill in both modes, and type on dark. */
  warn: string
  /** The same warning as type on a pale surface. */
  warnDeep: string
  /** Overdue / destructive, as type on a dark surface. */
  dangerDark: string
  /** …and on a pale one. */
  dangerLight: string
  /** Darkest surface, and the dark-mode theme-color. */
  deep: string
  /** The lighter end of the dark backdrop's gradient. */
  deep2: string
  /** Palest surface, and the light-mode theme-color. */
  pale: string
  /** Body text in light mode — the palette's hue pushed almost to black. */
  paleInk: string
}

export const PALETTES: Record<PaletteId, Palette> = {
  // Verbatim today's tokens, so Halo · Indigo · Dark is unchanged by all of this.
  indigo: {
    name: 'Indigo',
    blurb: 'Amber on deep indigo, violet for events and habits. Orbit as it is.',
    accent: '#ffb454', accent2: '#a78bfa',
    accentInk: '#2a1a00', accent2Ink: '#1a1140',
    accentDeep: '#9a5c00', accent2Deep: '#5b3bc9',
    done: '#4bd08a', doneInk: '#06301c', doneDeep: '#157f4a',
    warn: '#f2a15c', warnDeep: '#8a5200',
    // The doc's #c2410c measures 4.47:1 on Indigo's paper — a rounding error
    // short of AA, so it is taken one step darker rather than waived.
    dangerDark: '#ff6b6b', dangerLight: '#a8380a',
    deep: '#0d1030', deep2: '#151a4a', pale: '#f1eee6', paleInk: '#232033',
  },
  lagoon: {
    name: 'Lagoon',
    blurb: 'Cool teal with a coral warning colour — the calmest of the five.',
    accent: '#4fd1c5', accent2: '#7cc6ff',
    accentInk: '#04231f', accent2Ink: '#04202e',
    accentDeep: '#0f766e', accent2Deep: '#1d6ea8',
    done: '#5fe0a8', doneInk: '#032a1c', doneDeep: '#0f7a52',
    warn: '#eaa85f', warnDeep: '#8a5410',
    dangerDark: '#f2795c', dangerLight: '#a83f26',
    deep: '#04191e', deep2: '#07303a', pale: '#e9f1ef', paleInk: '#153230',
  },
  ember: {
    name: 'Ember',
    blurb: 'Terracotta and butter yellow. Warm, low-glare, good in the evening.',
    accent: '#d2694a', accent2: '#e8c56a',
    accentInk: '#2a0e06', accent2Ink: '#2b230a',
    accentDeep: '#a4482c', accent2Deep: '#8a6a12',
    done: '#7fc98f', doneInk: '#0d2a14', doneDeep: '#2f7a49',
    warn: '#e2a24f', warnDeep: '#82530d',
    // The design doc's #b4271f is a fill colour; as type on Ember's near-black
    // it lands at 2.3:1, so the dark variant is lifted until it reads.
    dangerDark: '#f2705e', dangerLight: '#a01f18',
    deep: '#1a0f0b', deep2: '#2e1712', pale: '#f6ece8', paleInk: '#33201c',
  },
  orchid: {
    name: 'Orchid',
    blurb: 'Violet primary with a pink alert — highest contrast on dark surfaces.',
    accent: '#a78bfa', accent2: '#f0768b',
    accentInk: '#1a1140', accent2Ink: '#2e0713',
    accentDeep: '#6d4bd8', accent2Deep: '#b02b45',
    done: '#4bd08a', doneInk: '#06301c', doneDeep: '#157f4a',
    warn: '#f0a862', warnDeep: '#8a551a',
    dangerDark: '#f0768b', dangerLight: '#c22a4c',
    deep: '#16141c', deep2: '#241f36', pale: '#f2eff6', paleInk: '#262133',
  },
  phosphor: {
    name: 'Phosphor',
    blurb: 'Acid green on near-black, blue for anything scheduled. Loudest option.',
    accent: '#7dff9b', accent2: '#5b9dff',
    // Acid green as type on near-white is the hardest case in the whole grid;
    // the doc's #1a7f37 lands at 4.48:1, so it is deepened until it reads.
    accentInk: '#04180a', accent2Ink: '#04142e',
    accentDeep: '#15702f', accent2Deep: '#1c5fbf',
    // Phosphor's accent is already green, so "done" moves to a deeper one that
    // can't be mistaken for the active colour at checkbox size.
    done: '#2fbf6d', doneInk: '#04180a', doneDeep: '#10703c',
    warn: '#ffc457', warnDeep: '#7a5300',
    dangerDark: '#ff5f56', dangerLight: '#c02a22',
    deep: '#0a0d0b', deep2: '#101a12', pale: '#edf2ec', paleInk: '#16211a',
  },
}

export interface Theme {
  name: string
  tagline: string
  /** Shown under the name on the Appearance screen. */
  type: string
}

export const THEMES: Record<ThemeId, Theme> = {
  halo: {
    name: 'Halo',
    tagline: 'Frosted cards over a lit backdrop',
    type: 'Manrope · 26px radii · frosted',
  },
  telemetry: {
    name: 'Telemetry',
    tagline: 'A readout, not a page',
    type: 'JetBrains Mono · square · hairlines',
  },
  terrain: {
    name: 'Terrain',
    tagline: 'Roomy, three things at a time',
    type: 'Outfit · 24px radii · soft cards',
  },
  transit: {
    name: 'Transit',
    tagline: 'The day on a single rail',
    type: 'Space Grotesk · 12px radii · one rail',
  },
}

/** Terrain shows only what must happen; everything else is one line away. */
export function collapsesSections(theme: ThemeId): boolean {
  return theme === 'terrain'
}

/** Transit replaces the Today list with a timeline rather than restyling it. */
export function usesSpine(theme: ThemeId): boolean {
  return theme === 'transit'
}

/**
 * The installed PWA's status bar. Follows mode and palette so the chrome above
 * the app matches the backdrop underneath it.
 */
export function themeColorFor(palette: PaletteId, mode: ResolvedMode): string {
  const p = PALETTES[palette]
  return mode === 'dark' ? p.deep : p.pale
}

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value)
}

export function isPaletteId(value: unknown): value is PaletteId {
  return typeof value === 'string' && (PALETTE_IDS as readonly string[]).includes(value)
}

export function isModeId(value: unknown): value is ModeId {
  return typeof value === 'string' && (MODE_IDS as readonly string[]).includes(value)
}

/** Anything unrecognised falls back to the default rather than throwing. */
export function coerceAppearance(value: unknown): Appearance {
  const v = (value ?? {}) as Partial<Appearance>
  return {
    theme: isThemeId(v.theme) ? v.theme : DEFAULT_APPEARANCE.theme,
    palette: isPaletteId(v.palette) ? v.palette : DEFAULT_APPEARANCE.palette,
    mode: isModeId(v.mode) ? v.mode : DEFAULT_APPEARANCE.mode,
  }
}

// ── contrast ────────────────────────────────────────────────────────────────
// WCAG 2.1 relative luminance, so "does this palette work" is a number rather
// than an opinion. Kept here rather than in the test because the Appearance
// screen uses the same maths to decide a swatch's ring colour.

export interface RGB {
  r: number
  g: number
  b: number
}

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

/** Flatten a translucent colour onto an opaque one. */
export function composite(fg: RGB, alpha: number, bg: RGB): RGB {
  return {
    r: fg.r * alpha + bg.r * (1 - alpha),
    g: fg.g * alpha + bg.g * (1 - alpha),
    b: fg.b * alpha + bg.b * (1 - alpha),
  }
}

export function relativeLuminance({ r, g, b }: RGB): number {
  const channel = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(a: RGB | string, b: RGB | string): number {
  const la = relativeLuminance(typeof a === 'string' ? hexToRgb(a) : a)
  const lb = relativeLuminance(typeof b === 'string' ? hexToRgb(b) : b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** Dark keeps today's translucent white; light mixes ink toward the surface. */
export const DIM_ALPHA_DARK = 0.62
export const DIM_MIX_LIGHT = 0.68

/** How much ink the meter track and the day-column backing carry. */
export const TRACK_MIX_LIGHT = 0.1

/**
 * The four text roles of §6, resolved for one combination, against the *bare*
 * page surface — the worst case. Every theme lifts its cards away from this
 * (dark surfaces get lighter, pale ones get paler), so passing here passes
 * everywhere, and the check needs no per-theme surface table to drift from.
 */
export function textRoles(palette: PaletteId, mode: ResolvedMode): {
  surface: RGB
  roles: { name: string; fg: RGB; bg: RGB }[]
} {
  const p = PALETTES[palette]
  const dark = mode === 'dark'
  const surface = hexToRgb(dark ? p.deep : p.pale)

  const ink = dark ? { r: 255, g: 255, b: 255 } : hexToRgb(p.paleInk)
  const dim = dark
    ? composite({ r: 255, g: 255, b: 255 }, DIM_ALPHA_DARK, surface)
    : composite(hexToRgb(p.paleInk), DIM_MIX_LIGHT, surface)

  return {
    surface,
    roles: [
      { name: 'ink on surface', fg: ink, bg: surface },
      { name: 'dim on surface', fg: dim, bg: surface },
      { name: 'accent-text on surface', fg: hexToRgb(dark ? p.accent : p.accentDeep), bg: surface },
      { name: 'accent-ink on accent', fg: hexToRgb(p.accentInk), bg: hexToRgb(p.accent) },
      { name: 'accent-2-ink on accent-2', fg: hexToRgb(p.accent2Ink), bg: hexToRgb(p.accent2) },
      { name: 'danger on surface', fg: hexToRgb(dark ? p.dangerDark : p.dangerLight), bg: surface },
      { name: 'warn on surface', fg: hexToRgb(dark ? p.warn : p.warnDeep), bg: surface },
    ],
  }
}

/**
 * The marks that carry no text: the capacity meter's fill, calendar pips, habit
 * dots, day-column and spine items. Nothing is drawn *on* these, so the only
 * thing they can be read against is the track behind them — which is why they
 * take the deep twins on paper. WCAG puts non-text UI at 3:1 rather than 4.5:1.
 *
 * Measured against the track (the meter's groove, the day column's backing)
 * rather than the card, because the track is the lighter-in-dark /
 * darker-in-light of the two and therefore the closer contest.
 */
export function markRoles(palette: PaletteId, mode: ResolvedMode): {
  track: RGB
  roles: { name: string; fg: RGB; bg: RGB }[]
} {
  const p = PALETTES[palette]
  const dark = mode === 'dark'
  const surface = hexToRgb(dark ? p.deep : p.pale)
  const track = dark
    ? composite({ r: 255, g: 255, b: 255 }, 0.06, surface)
    : composite(hexToRgb(p.paleInk), TRACK_MIX_LIGHT, surface)

  return {
    track,
    roles: [
      { name: 'accent mark on track', fg: hexToRgb(dark ? p.accent : p.accentDeep), bg: track },
      { name: 'secondary mark on track', fg: hexToRgb(dark ? p.accent2 : p.accent2Deep), bg: track },
      { name: 'done mark on track', fg: hexToRgb(dark ? p.done : p.doneDeep), bg: track },
    ],
  }
}
