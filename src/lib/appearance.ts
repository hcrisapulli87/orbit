// Applying an appearance. The values themselves are domain data
// (domain/appearance.ts); everything here touches the DOM or localStorage.
//
// Postgres is the source of truth. The localStorage copy exists for exactly
// one reason: main.tsx has to set the attributes *before* React mounts, and at
// that point the settings row hasn't been fetched. Without the mirror, every
// cold start would paint Halo · Indigo · dark for a beat and then jump.
// It is written on save and on load, and read only by the pre-mount apply.

import type { CSSProperties } from 'react'
import {
  DEFAULT_APPEARANCE,
  PALETTES,
  coerceAppearance,
  themeColorFor,
} from '../domain/appearance'
import type { Appearance, ResolvedMode } from '../domain/appearance'

const KEY = 'orbit.appearance'

export function readStoredAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? coerceAppearance(JSON.parse(raw)) : DEFAULT_APPEARANCE
  } catch {
    // Private-mode Safari throws on localStorage, and a half-written value
    // throws on parse. Neither is worth a broken app.
    return DEFAULT_APPEARANCE
  }
}

export function storeAppearance(appearance: Appearance): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(appearance))
  } catch {
    // Best effort: losing the mirror costs a flash on next launch, nothing more.
  }
}

export function clearStoredAppearance(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* see above */
  }
}

const prefersDark = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches

export function resolveMode(mode: Appearance['mode']): ResolvedMode {
  if (mode === 'system') return prefersDark() ? 'dark' : 'light'
  return mode
}

/** What the pre-mount apply and the watcher both re-read. */
let current: Appearance = DEFAULT_APPEARANCE

/**
 * Set the three attributes the stylesheet keys off, and match the installed
 * PWA's status bar to the backdrop underneath it.
 *
 * Attributes rather than classes so the cascade layers stay independent: a
 * theme swap can't disturb the palette, because they are different attributes.
 */
export function applyAppearance(appearance: Appearance): ResolvedMode {
  current = appearance
  const mode = resolveMode(appearance.mode)
  const root = document.documentElement
  root.setAttribute('data-theme', appearance.theme)
  root.setAttribute('data-palette', appearance.palette)
  root.setAttribute('data-mode', mode)
  // Tells the browser's own form controls, scrollbars and autofill which way
  // round we are, so they don't render a light widget on a dark card.
  root.style.colorScheme = mode

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', themeColorFor(appearance.palette, mode))

  return mode
}

/**
 * Re-resolve when the OS flips. Only matters while the stored mode is
 * 'system' — an explicit light or dark ignores the OS by definition.
 *
 * Returns its own teardown so a caller in an effect can just hand it back.
 */
export function watchSystemMode(): () => void {
  if (typeof matchMedia !== 'function') return () => {}
  const query = matchMedia('(prefers-color-scheme: dark)')
  const onChange = () => {
    if (current.mode === 'system') applyAppearance(current)
  }
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** The five swatch fills on the Appearance screen, so it needs no colour of its own. */
export const SWATCH_STYLE = (palette: keyof typeof PALETTES) =>
  ({
    '--sw-accent': PALETTES[palette].accent,
    '--sw-accent-2': PALETTES[palette].accent2,
  }) as CSSProperties
