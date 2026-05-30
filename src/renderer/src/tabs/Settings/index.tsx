import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useSettingsStore } from '../../store/settings.store'
import { ThemeName } from '../../../../shared/types'

const THEMES: { id: ThemeName; label: string; preview: string }[] = [
  { id: 'dark-oled', label: 'Dark OLED', preview: '#000' },
  { id: 'glassmorphism', label: 'Glassmorphism', preview: 'linear-gradient(135deg,#0d1117,#1e3a5f)' },
  { id: 'neon-cyberpunk', label: 'Neon Cyberpunk', preview: 'linear-gradient(135deg,#07070f,#ff2d78)' },
  { id: 'terminal-tui', label: 'Terminal TUI', preview: 'linear-gradient(135deg,#0c0c0c,#004400)' },
  { id: 'custom', label: 'Custom', preview: 'var(--color-surface-raised)' }
]

function PathList({ label, paths, onChange }: { label: string; paths: string[]; onChange: (p: string[]) => void }): React.ReactElement {
  const [newPath, setNewPath] = useState('')
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{label}</label>
      {paths.map((p, i) => (
        <div key={i} className="flex gap-2 items-center">
          <span className="flex-1 text-sm px-3 py-1.5 rounded" style={{ background: 'var(--color-surface-raised)', color: 'var(--color-text)', border: '1px solid var(--color-border)', fontFamily: 'var(--font-mono)' }}>{p}</span>
          <button onClick={() => onChange(paths.filter((_, j) => j !== i))} className="px-2 py-1 text-xs rounded" style={{ background: '#ff444420', color: '#ff4444', border: '1px solid #ff444430' }}>✕</button>
        </div>
      ))}
      <div className="flex gap-2">
        <input
          value={newPath}
          onChange={(e) => setNewPath(e.target.value)}
          placeholder="/path/to/folder"
          className="flex-1 text-sm px-3 py-1.5 rounded"
          style={{ background: 'var(--color-surface-raised)', color: 'var(--color-text)', border: '1px solid var(--color-border)', fontFamily: 'var(--font-mono)', outline: 'none' }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newPath.trim()) {
              onChange([...paths, newPath.trim()])
              setNewPath('')
            }
          }}
        />
        <motion.button
          className="px-3 py-1.5 rounded text-sm"
          style={{ background: 'var(--color-accent)', color: 'var(--color-bg)' }}
          onClick={() => { if (newPath.trim()) { onChange([...paths, newPath.trim()]); setNewPath('') } }}
          whileTap={{ scale: 0.96 }}
        >
          Add
        </motion.button>
        <motion.button
          className="px-3 py-1.5 rounded text-sm"
          style={{ background: 'var(--color-surface-raised)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
          onClick={async () => {
            const dir = await window.htpc.openDirectory()
            if (dir) onChange([...paths, dir])
          }}
          whileTap={{ scale: 0.96 }}
        >
          Browse…
        </motion.button>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }): React.ReactElement {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="px-3 py-2 rounded text-sm"
        style={{ background: 'var(--color-surface-raised)', color: 'var(--color-text)', border: '1px solid var(--color-border)', outline: 'none' }}
      />
    </div>
  )
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }): React.ReactElement {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm" style={{ color: 'var(--color-text)' }}>{label}</span>
      <button
        onClick={() => onChange(!value)}
        className="w-11 h-6 rounded-full transition-colors relative"
        style={{ background: value ? 'var(--color-accent)' : 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
      >
        <span
          className="absolute top-0.5 w-5 h-5 rounded-full transition-transform"
          style={{ background: 'white', left: value ? '1.25rem' : '0.125rem', transform: 'translateX(0)' }}
        />
      </button>
    </div>
  )
}

export const SettingsTab: React.FC = () => {
  const { settings, update } = useSettingsStore()
  if (!settings) return null

  return (
    <div className="h-full overflow-y-auto gpu-scroll">
      <div className="max-w-2xl mx-auto p-6 flex flex-col gap-8">
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>Appearance</h2>
          <div>
            <label className="text-sm font-medium mb-3 block" style={{ color: 'var(--color-text)' }}>Theme</label>
            <div className="grid grid-cols-5 gap-3">
              {THEMES.map((t) => (
                <motion.button
                  key={t.id}
                  className="flex flex-col items-center gap-2 p-2 rounded-[var(--radius-card)]"
                  style={{
                    border: `2px solid ${settings.theme === t.id ? 'var(--color-accent)' : 'var(--color-border)'}`,
                    background: 'var(--color-surface-raised)',
                    boxShadow: settings.theme === t.id ? 'var(--shadow-glow)' : 'none'
                  }}
                  onClick={() => update({ theme: t.id })}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <div className="w-full h-12 rounded" style={{ background: t.preview }} />
                  <span className="text-xs text-center" style={{ color: 'var(--color-text-dim)' }}>{t.label}</span>
                </motion.button>
              ))}
            </div>
          </div>
          <Toggle label="Start Fullscreen" value={settings.fullscreen} onChange={(v) => update({ fullscreen: v })} />
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>Media Directories</h2>
          <PathList label="Movie Paths" paths={settings.moviePaths} onChange={(p) => update({ moviePaths: p })} />
          <PathList label="Music Paths" paths={settings.musicPaths} onChange={(p) => update({ musicPaths: p })} />
          <PathList label="ROM Paths" paths={settings.romPaths} onChange={(p) => update({ romPaths: p })} />
          <PathList label="Game Paths" paths={settings.gamePaths} onChange={(p) => update({ gamePaths: p })} />
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>API Keys</h2>
          <p className="text-sm" style={{ color: 'var(--color-text-dim)' }}>Optional. Improves metadata quality and rate limits.</p>
          <Field label="TMDB API Key" value={settings.tmdbApiKey ?? ''} onChange={(v) => update({ tmdbApiKey: v })} placeholder="eyJ…" type="password" />
          <Field label="RAWG API Key" value={settings.rawgApiKey ?? ''} onChange={(v) => update({ rawgApiKey: v })} placeholder="Optional" type="password" />
          <Field label="AcoustID API Key" value={settings.acoustidApiKey ?? ''} onChange={(v) => update({ acoustidApiKey: v })} placeholder="Optional" type="password" />
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>General</h2>
          <Toggle label="Start on Boot" value={settings.startOnBoot} onChange={(v) => update({ startOnBoot: v })} />
          <Toggle label="Hardware Acceleration" value={settings.hardwareAcceleration} onChange={(v) => update({ hardwareAcceleration: v })} />
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>Plugins</h2>
          <p className="text-sm" style={{ color: 'var(--color-text-dim)' }}>
            Drop TypeScript files or folders into{' '}
            <code className="px-1.5 py-0.5 rounded text-xs" style={{ background: 'var(--color-surface-raised)', fontFamily: 'var(--font-mono)' }}>
              ~/.config/htpc/plugins/
            </code>
          </p>
          <motion.button
            className="self-start px-4 py-2 rounded-[var(--radius-card)] text-sm"
            style={{ background: 'var(--color-surface-raised)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
            onClick={() => window.htpc.plugins.reload()}
            whileTap={{ scale: 0.96 }}
          >
            ↺ Reload Plugins
          </motion.button>
        </section>
      </div>
    </div>
  )
}
