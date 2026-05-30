import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSettingsStore } from './store/settings.store'
import { useInputStore } from './store/input.store'
import { ThemeBackground } from './components/ThemeBackground/ThemeBackground'
import { GamingTab } from './tabs/Gaming'
import { MoviesTab } from './tabs/Movies'
import { MusicTab } from './tabs/Music'
import { TVShowsTab } from './tabs/TVShows'
import { SettingsTab } from './tabs/Settings'
import { ControllersTab } from './tabs/Controllers'
import { TabId } from '../../shared/types'

interface TabDef {
  id: TabId
  label: string
  icon: string
  component: React.ComponentType
}

const TABS: TabDef[] = [
  { id: 'gaming', label: 'Gaming', icon: '🎮', component: GamingTab },
  { id: 'movies', label: 'Movies', icon: '🎬', component: MoviesTab },
  { id: 'music', label: 'Music', icon: '🎵', component: MusicTab },
  { id: 'tv-shows', label: 'TV Shows', icon: '📺', component: TVShowsTab },
  { id: 'controllers', label: 'Controllers', icon: '🕹', component: ControllersTab },
  { id: 'settings', label: 'Settings', icon: '⚙', component: SettingsTab }
]

const TAB_IDS = TABS.map((t) => t.id)

export default function App(): React.ReactElement {
  const { settings, loading, load } = useSettingsStore()
  const { addDevice, removeDevice } = useInputStore()
  const [activeTab, setActiveTab] = useState<TabId>('gaming')
  const activeTabRef = useRef<TabId>(activeTab)
  activeTabRef.current = activeTab

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (settings?.defaultTab) setActiveTab(settings.defaultTab)
  }, [settings?.defaultTab])

  useEffect(() => {
    const unsubConnect = window.htpc.input.onDeviceConnected(addDevice)
    const unsubDisconnect = window.htpc.input.onDeviceDisconnected(removeDevice)
    const unsubEvent = window.htpc.input.onEvent((ev) => {
      useInputStore.getState().setLastEvent(ev)
      if (ev.type === 'button_press' && ev.action === 'start') {
        const idx = TAB_IDS.indexOf(activeTabRef.current)
        setActiveTab(TAB_IDS[(idx + 1) % TAB_IDS.length])
      }
    })
    return () => {
      unsubConnect()
      unsubDisconnect()
      unsubEvent()
    }
  }, [])

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center" style={{ background: '#000', color: '#fff' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }} />
          <span className="text-sm opacity-50">Loading HTPC…</span>
        </div>
      </div>
    )
  }

  const ActiveComponent = TABS.find((t) => t.id === activeTab)?.component ?? GamingTab

  return (
    <div
      className="h-screen w-screen flex flex-col overflow-hidden relative"
      style={{ background: 'var(--color-bg)' }}
    >
      <ThemeBackground />

      <div className="relative z-10 flex flex-col h-full">
        {/* Tab bar */}
        <nav
          className="flex items-center gap-1 px-4 pt-3 pb-0 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          {TABS.map((tab) => {
            const isActive = tab.id === activeTab
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors focus:outline-none"
                style={{
                  color: isActive ? 'var(--color-text)' : 'var(--color-text-dim)',
                  background: isActive ? 'var(--color-surface-raised)' : 'transparent'
                }}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                {isActive && (
                  <motion.div
                    layoutId="tab-indicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                    style={{ background: 'var(--color-accent)', boxShadow: 'var(--shadow-glow)' }}
                    transition={{ type: 'spring', damping: 30, stiffness: 400 }}
                  />
                )}
              </button>
            )
          })}

          <div className="ml-auto flex items-center gap-2 pb-1">
            <button
              className="px-3 py-1.5 rounded text-xs"
              style={{ color: 'var(--color-text-dim)', background: 'transparent' }}
              onClick={() => window.htpc.app.setFullscreen(true)}
              title="Fullscreen"
            >
              ⛶
            </button>
          </div>
        </nav>

        {/* Tab content */}
        <div className="flex-1 min-h-0 relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              className="absolute inset-0"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
            >
              <ActiveComponent />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
