import { describe, expect, it } from 'vitest'
// Vite hands the sheet over as a string, which keeps this a plain unit test —
// no node types, no path resolution, and it moves with the file if it moves.
import CSS from '../styles/theme.css?raw'
import {
  DIM_ALPHA_DARK,
  DIM_MIX_LIGHT,
  MODE_IDS,
  PALETTES,
  PALETTE_IDS,
  THEME_IDS,
  coerceAppearance,
  collapsesSections,
  contrastRatio,
  markRoles,
  themeColorFor,
  usesSpine,
  textRoles,
} from './appearance'
import type { PaletteId, ResolvedMode } from './appearance'

const RESOLVED: ResolvedMode[] = ['dark', 'light']

/** WCAG AA for body text. Everything in these roles is body-sized or smaller. */
const AA = 4.5
/** WCAG 1.4.11: graphics and UI components that aren't text. */
const AA_NON_TEXT = 3

describe('every combination is legible', () => {
  // The theme axis is deliberately absent: a theme may not declare a hue, so
  // 4 themes × this grid is the same 10 colour situations four times over.
  // If that ever stops being true, the CSS guard below is what catches it.
  for (const palette of PALETTE_IDS) {
    for (const mode of RESOLVED) {
      it(`${palette} · ${mode} passes AA on every text role`, () => {
        const { roles } = textRoles(palette, mode)
        const failures = roles
          .map((r) => ({ name: r.name, ratio: contrastRatio(r.fg, r.bg) }))
          .filter((r) => r.ratio < AA)
          .map((r) => `${r.name} = ${r.ratio.toFixed(2)}:1`)
        expect(failures).toEqual([])
      })
    }
  }

  it('checks all 40 combinations', () => {
    expect(THEME_IDS.length * PALETTE_IDS.length * RESOLVED.length).toBe(40)
  })
})

describe('every combination is visible', () => {
  // The marks that carry no text — the capacity meter, calendar pips, habit
  // dots, day-column and spine items. WCAG puts non-text UI at 3:1. This is
  // the check the text roles alone missed: an accent that reads perfectly well
  // *under* dark ink can still be invisible as a bare bar on paper.
  for (const palette of PALETTE_IDS) {
    for (const mode of RESOLVED) {
      it(`${palette} · ${mode} keeps its marks visible`, () => {
        const { roles } = markRoles(palette, mode)
        const failures = roles
          .map((r) => ({ name: r.name, ratio: contrastRatio(r.fg, r.bg) }))
          .filter((r) => r.ratio < AA_NON_TEXT)
          .map((r) => `${r.name} = ${r.ratio.toFixed(2)}:1`)
        expect(failures).toEqual([])
      })
    }
  }
})

describe('--dim never gets lighter than today', () => {
  // The plan states the floor as an opacity — 62% dark, 58% light — and calls
  // it a lint check. That is what this is: the constants may only ever move
  // toward the ink, and the sheet has to be using the same two numbers.
  it('holds the dark floor at 62%', () => {
    expect(DIM_ALPHA_DARK).toBeGreaterThanOrEqual(0.62)
    expect(CSS).toContain('--dim: rgba(255, 255, 255, 0.62)')
  })

  it('holds the light floor at 58% or better', () => {
    // 58% measured 3.9:1 on paper, under AA, so light sits at 68%. The floor
    // is a minimum, not a target — going darker is always allowed.
    expect(DIM_MIX_LIGHT).toBeGreaterThanOrEqual(0.58)
    expect(CSS).toContain(
      `--dim: color-mix(in srgb, var(--tint-pale-ink) ${Math.round(DIM_MIX_LIGHT * 100)}%, var(--tint-pale))`,
    )
  })
})

describe('theme-color follows mode and palette', () => {
  it('is the dark tint on dark and the pale one on light', () => {
    expect(themeColorFor('indigo', 'dark')).toBe('#0d1030') // today's meta tag
    expect(themeColorFor('indigo', 'light')).toBe('#f1eee6')
    expect(themeColorFor('phosphor', 'dark')).toBe('#0a0d0b')
  })
})

describe('coerceAppearance', () => {
  it('keeps anything valid', () => {
    expect(coerceAppearance({ theme: 'transit', palette: 'ember', mode: 'light' })).toEqual({
      theme: 'transit', palette: 'ember', mode: 'light',
    })
  })

  it('falls back rather than throwing on junk', () => {
    // A row written by an older build, a hand-edited localStorage value, or a
    // theme we removed all land here. None of them should white-screen the app.
    expect(coerceAppearance({ theme: 'aurora', palette: null, mode: 42 })).toEqual({
      theme: 'halo', palette: 'indigo', mode: 'system',
    })
    expect(coerceAppearance(undefined)).toEqual({ theme: 'halo', palette: 'indigo', mode: 'system' })
  })
})

describe('which themes restructure Today', () => {
  it('only Terrain collapses and only Transit replaces', () => {
    expect(THEME_IDS.filter(collapsesSections)).toEqual(['terrain'])
    expect(THEME_IDS.filter(usesSpine)).toEqual(['transit'])
  })
})

// ── the drift guard ─────────────────────────────────────────────────────────
// The hues live twice: here as data, and in theme.css as custom properties.
// Reading the sheet back is cheap and keeps that duplication honest — without
// it, a colour tweaked in CSS would silently stop being the one under test.


/** The declarations inside one `[data-…="id"] { … }` block. */
function block(attr: string, id: string): Map<string, string> {
  const start = CSS.indexOf(`[data-${attr}="${id}"] {`)
  expect(start, `no [data-${attr}="${id}"] block in theme.css`).toBeGreaterThan(-1)
  const body = CSS.slice(start, CSS.indexOf('}', start))
  const out = new Map<string, string>()
  for (const [, name, value] of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    out.set(name, value.trim())
  }
  return out
}

const CSS_NAME: Record<string, keyof (typeof PALETTES)[PaletteId]> = {
  '--accent': 'accent',
  '--accent-2': 'accent2',
  '--accent-ink': 'accentInk',
  '--accent-2-ink': 'accent2Ink',
  '--accent-deep': 'accentDeep',
  '--accent-2-deep': 'accent2Deep',
  '--done': 'done',
  '--done-ink': 'doneInk',
  '--done-deep': 'doneDeep',
  '--warn-bright': 'warn',
  '--warn-deep': 'warnDeep',
  '--danger-dark': 'dangerDark',
  '--danger-light': 'dangerLight',
  '--tint-deep': 'deep',
  '--tint-deep-2': 'deep2',
  '--tint-pale': 'pale',
  '--tint-pale-ink': 'paleInk',
}

describe('theme.css agrees with the token table', () => {
  for (const palette of PALETTE_IDS) {
    it(`${palette}`, () => {
      const declared = block('palette', palette)
      for (const [cssName, tsName] of Object.entries(CSS_NAME)) {
        expect(declared.get(cssName), `${palette} ${cssName}`).toBe(PALETTES[palette][tsName])
      }
    })
  }

  it('declares a block for every theme and mode', () => {
    for (const theme of THEME_IDS) expect(block('theme', theme).size).toBeGreaterThan(0)
    for (const mode of ['dark', 'light']) expect(block('mode', mode).size).toBeGreaterThan(0)
  })

  it('no theme declares a hue', () => {
    // A theme owns shape, type and elevation. The moment one hard-codes a
    // colour, a palette swap stops reaching part of the app — so the rule is
    // enforced rather than remembered.
    const HUE = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i
    // Shadows and masks are allowed their black-and-white: neither is a hue,
    // and both have to be literal to describe an elevation or a comb.
    const SHAPE_ONLY = /^(--shadow|--card-shadow|--.*-mask)/
    for (const theme of THEME_IDS) {
      for (const [name, value] of block('theme', theme)) {
        if (SHAPE_ONLY.test(name)) continue
        expect(HUE.test(value), `[data-theme="${theme}"] ${name}: ${value}`).toBe(false)
      }
    }
  })

  it('has no colour literals left outside the three token layers', () => {
    // Everything after the theme blocks is component CSS, and it may only
    // reference tokens. This is the check that keeps a fifth palette free.
    const componentsStart = CSS.indexOf('* { box-sizing: border-box; }')
    expect(componentsStart).toBeGreaterThan(-1)
    const offenders = CSS.slice(componentsStart)
      .split('\n')
      .map((line) => line.trim())
      // Black and white are polarity, not hue: shadows, scrims and the inset
      // highlight that makes glass look like glass are all built from them.
      .filter((line) => /#(?!000\b|fff\b)[0-9a-f]{3,8}\b/i.test(line))
    expect(offenders).toEqual([])
  })

  it('MODE_IDS offers system as well as the two resolved modes', () => {
    expect([...MODE_IDS]).toEqual(['system', 'light', 'dark'])
  })
})
