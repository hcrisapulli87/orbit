import { Link } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { useData } from '../data/DataProvider'
import { PALETTES, PALETTE_IDS, THEMES, THEME_IDS } from '../domain/appearance'
import type { ModeId, PaletteId, ThemeId } from '../domain/appearance'
import { SWATCH_STYLE } from '../lib/appearance'

const MODES: { value: ModeId; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

/**
 * Three axes, three controls, and every change applies the moment it's tapped —
 * there is no Save button, because the whole screen is the preview.
 *
 * Writing goes through the same optimistic saveSettings as capacity or day
 * length, so the picker is instant and Postgres catches up; DataProvider's
 * effect is what actually moves the attributes on <html>.
 */
export default function Appearance() {
  const { settings, saveSettings } = useData()

  return (
    <main className="screen">
      <ScreenHeader
        title="Appearance"
        sub="Theme, colour and light or dark are independent"
        action={
          <Link className="gear" to="/settings" aria-label="Back">
            ✕
          </Link>
        }
      />

      <div className="card">
        <h2>Mode</h2>
        <SegmentedControl
          value={settings.ui_mode}
          options={MODES}
          onChange={(ui_mode) => void saveSettings({ ui_mode })}
        />
        <p className="muted" style={{ margin: 0, fontSize: '0.78rem' }}>
          System follows the phone or laptop, and changes with it — including
          overnight, without reopening the app.
        </p>
      </div>

      <div className="card">
        <h2>Colour</h2>
        <div className="swatches">
          {PALETTE_IDS.map((id: PaletteId) => (
            <button
              key={id}
              className="swatch"
              style={SWATCH_STYLE(id)}
              aria-pressed={settings.ui_palette === id}
              aria-label={PALETTES[id].name}
              onClick={() => void saveSettings({ ui_palette: id })}
            >
              <span className="swatch__disc" />
            </button>
          ))}
        </div>
        <p className="muted" style={{ margin: '10px 0 0', fontSize: '0.78rem' }}>
          <strong style={{ color: 'var(--ink)' }}>{PALETTES[settings.ui_palette].name}</strong>{' '}
          — {PALETTES[settings.ui_palette].blurb}
        </p>
      </div>

      <div className="card">
        <h2>Theme</h2>
        {THEME_IDS.map((id: ThemeId) => (
          <button
            key={id}
            className="choice"
            aria-pressed={settings.ui_theme === id}
            onClick={() => void saveSettings({ ui_theme: id })}
          >
            <span className="choice__radio" />
            <span className="choice__body">
              <span className="choice__name">{THEMES[id].name}</span>
              <span className="choice__sub">
                {THEMES[id].tagline} · {THEMES[id].type}
              </span>
            </span>
          </button>
        ))}
        <p className="muted" style={{ margin: '12px 0 0', fontSize: '0.78rem' }}>
          A theme changes shape, type and how much of the day is on screen at
          once. It never changes the colour — that's what the row above is for.
        </p>
      </div>
    </main>
  )
}
