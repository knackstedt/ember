import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useInputStore } from '../../store/input.store'
import { ControllerDevice, ControllerType, ButtonMapping } from '../../../../shared/types'

const CONTROLLER_ICONS: Record<ControllerType, string> = {
  xbox: '🎮',
  ps1: '🕹', ps2: '🕹', ps3: '🕹', ps4: '🕹', ps5: '🕹',
  gamecube: '🟣',
  wiimote: '📡',
  generic: '🕹'
}

const DEFAULT_ACTIONS = [
  'confirm', 'cancel', 'up', 'down', 'left', 'right',
  'menu', 'back', 'page_up', 'page_down', 'favorite', 'search',
  'play_pause', 'volume_up', 'volume_down', 'fullscreen'
]

const XBOX_BUTTON_LABELS: Record<string, string> = {
  south: 'A', east: 'B', west: 'X', north: 'Y',
  left_bumper: 'LB', right_bumper: 'RB',
  select: 'Back/View', start: 'Start/Menu', home: 'Xbox',
  left_thumb: 'LS', right_thumb: 'RS',
  dpad_up: 'D-Up', dpad_down: 'D-Down', dpad_left: 'D-Left', dpad_right: 'D-Right'
}

interface MappingRowProps {
  deviceId: string
  inputCode: string
  currentAction: string
  onSave: (action: string) => void
}

const MappingRow: React.FC<MappingRowProps> = ({ deviceId, inputCode, currentAction, onSave }) => {
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState(currentAction)

  return (
    <div
      className="flex items-center justify-between py-2 px-3 rounded"
      style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}
    >
      <span className="text-sm font-mono" style={{ color: 'var(--color-text)' }}>
        {XBOX_BUTTON_LABELS[inputCode] ?? inputCode}
      </span>
      {editing ? (
        <div className="flex gap-2 items-center">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="text-sm px-2 py-1 rounded"
            style={{ background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)', outline: 'none' }}
          >
            {DEFAULT_ACTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <motion.button
            className="px-3 py-1 rounded text-xs"
            style={{ background: 'var(--color-accent)', color: 'var(--color-bg)' }}
            onClick={() => { onSave(selected); setEditing(false) }}
            whileTap={{ scale: 0.96 }}
          >
            Save
          </motion.button>
          <motion.button
            className="px-3 py-1 rounded text-xs"
            style={{ background: 'var(--color-surface)', color: 'var(--color-text-dim)', border: '1px solid var(--color-border)' }}
            onClick={() => setEditing(false)}
            whileTap={{ scale: 0.96 }}
          >
            Cancel
          </motion.button>
        </div>
      ) : (
        <div className="flex gap-3 items-center">
          <span className="text-sm" style={{ color: 'var(--color-accent)' }}>{currentAction || '—'}</span>
          <motion.button
            className="px-2 py-0.5 rounded text-xs"
            style={{ background: 'var(--color-surface)', color: 'var(--color-text-dim)', border: '1px solid var(--color-border)' }}
            onClick={() => setEditing(true)}
            whileTap={{ scale: 0.96 }}
          >
            Edit
          </motion.button>
        </div>
      )}
    </div>
  )
}

export const ControllersTab: React.FC = () => {
  const { devices, lastEvent } = useInputStore()
  const [selectedDevice, setSelectedDevice] = useState<ControllerDevice | null>(null)
  const [mappings, setMappings] = useState<ButtonMapping[]>([])

  useEffect(() => {
    if (devices.length > 0 && !selectedDevice) {
      setSelectedDevice(devices[0])
    }
  }, [devices])

  useEffect(() => {
    if (!selectedDevice) return
    window.htpc.input.getMappings(selectedDevice.id).then(setMappings)
  }, [selectedDevice])

  const saveMapping = (inputCode: string, action: string): void => {
    if (!selectedDevice) return
    window.htpc.input.setMapping(selectedDevice.id, inputCode, action)
    setMappings((prev) => {
      const existing = prev.findIndex((m) => m.inputCode === inputCode)
      if (existing >= 0) {
        const next = [...prev]
        next[existing] = { deviceId: selectedDevice.id, inputCode, action }
        return next
      }
      return [...prev, { deviceId: selectedDevice.id, inputCode, action }]
    })
  }

  const BUTTON_CODES = Object.keys(XBOX_BUTTON_LABELS)

  return (
    <div className="h-full flex gap-4 p-4 overflow-hidden">
      <div className="w-64 flex-shrink-0 flex flex-col gap-3">
        <h2 className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>Connected Devices</h2>

        {devices.length === 0 ? (
          <div className="text-sm text-center py-8" style={{ color: 'var(--color-text-dim)' }}>
            No controllers detected.<br />
            <span className="text-xs opacity-60">User must be in the <code>input</code> group for evdev access.</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {devices.map((dev) => (
              <motion.button
                key={dev.id}
                className="flex gap-3 items-center p-3 rounded-[var(--radius-card)] text-left"
                style={{
                  background: selectedDevice?.id === dev.id ? 'var(--color-surface-raised)' : 'var(--color-surface)',
                  border: `1px solid ${selectedDevice?.id === dev.id ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  boxShadow: selectedDevice?.id === dev.id ? 'var(--shadow-glow)' : 'none'
                }}
                onClick={() => setSelectedDevice(dev)}
                whileTap={{ scale: 0.98 }}
              >
                <span className="text-2xl">{CONTROLLER_ICONS[dev.type]}</span>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>{dev.name}</span>
                  <span className="text-xs capitalize" style={{ color: 'var(--color-text-dim)' }}>{dev.type}</span>
                </div>
              </motion.button>
            ))}
          </div>
        )}

        {lastEvent && (
          <div className="mt-4 p-3 rounded-[var(--radius-card)] text-xs" style={{ background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)' }}>
            <div className="font-medium mb-1" style={{ color: 'var(--color-accent)' }}>Last Input</div>
            <div style={{ color: 'var(--color-text-dim)' }}>
              <div>Source: {lastEvent.source}</div>
              <div>Action: {lastEvent.action ?? lastEvent.axis}</div>
              {lastEvent.value !== undefined && <div>Value: {lastEvent.value}</div>}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto gpu-scroll">
        {selectedDevice ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{CONTROLLER_ICONS[selectedDevice.type]}</span>
              <div>
                <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>{selectedDevice.name}</h2>
                <p className="text-sm capitalize" style={{ color: 'var(--color-text-dim)' }}>
                  {selectedDevice.type} · {selectedDevice.buttonCount} buttons · {selectedDevice.axisCount} axes
                  {selectedDevice.vendorId ? ` · VID:${selectedDevice.vendorId.toString(16).padStart(4,'0')} PID:${selectedDevice.productId?.toString(16).padStart(4,'0')}` : ''}
                </p>
              </div>
            </div>

            <h3 className="text-sm font-semibold mt-2" style={{ color: 'var(--color-text-dim)' }}>Button Mappings</h3>
            <div className="flex flex-col gap-2">
              {BUTTON_CODES.map((code) => {
                const mapping = mappings.find((m) => m.inputCode === code)
                return (
                  <MappingRow
                    key={code}
                    deviceId={selectedDevice.id}
                    inputCode={code}
                    currentAction={mapping?.action ?? ''}
                    onSave={(action) => saveMapping(code, action)}
                  />
                )
              })}
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center" style={{ color: 'var(--color-text-dim)' }}>
            Select a controller to configure it.
          </div>
        )}
      </div>
    </div>
  )
}
