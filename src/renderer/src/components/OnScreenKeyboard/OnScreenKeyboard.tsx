import React, { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface OnScreenKeyboardProps {
  value: string
  onChange: (value: string) => void
  onClose: () => void
  label?: string
}

const ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
  [' ', '⌫', '✓']
]

const ROWS_SHIFT = [
  ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
  [' ', '⌫', '✓']
]

export const OnScreenKeyboard: React.FC<OnScreenKeyboardProps> = ({
  value,
  onChange,
  onClose,
  label
}) => {
  const [shift, setShift] = useState(false)
  const rows = shift ? ROWS_SHIFT : ROWS

  const handleKey = useCallback(
    (key: string) => {
      if (key === '⌫') {
        onChange(value.slice(0, -1))
      } else if (key === '✓') {
        onClose()
      } else if (key === ' ') {
        onChange(value + ' ')
      } else {
        onChange(value + key)
        if (shift) setShift(false)
      }
    },
    [value, onChange, onClose, shift]
  )

  return (
    <motion.div
      initial={{ y: '100%', opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: '100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      className="fixed bottom-0 left-0 right-0 z-50 p-4"
      style={{
        background: 'var(--color-surface-overlay)',
        backdropFilter: 'blur(var(--blur-panel))',
        borderTop: '1px solid var(--color-border)'
      }}
    >
      {label && (
        <div
          className="text-sm mb-2 px-1 opacity-60"
          style={{ color: 'var(--color-text-dim)' }}
        >
          {label}
        </div>
      )}

      <div
        className="mb-3 px-3 py-2 rounded-[var(--radius-card)] font-mono text-base truncate"
        style={{
          background: 'var(--color-surface-raised)',
          color: 'var(--color-text)',
          border: '1px solid var(--color-border)',
          minHeight: '2.5rem'
        }}
      >
        {value || <span style={{ color: 'var(--color-text-dim)' }}>_</span>}
      </div>

      <div className="flex flex-col gap-2 items-center">
        {rows.map((row, ri) => (
          <div key={ri} className="flex gap-1.5 justify-center">
            {ri === rows.length - 1 && (
              <motion.button
                className="px-4 py-2.5 rounded text-sm font-bold"
                style={{
                  background: shift ? 'var(--color-accent)' : 'var(--color-surface-raised)',
                  color: shift ? 'var(--color-bg)' : 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                  minWidth: '3rem'
                }}
                onClick={() => setShift((s) => !s)}
                whileTap={{ scale: 0.92 }}
              >
                ⇧
              </motion.button>
            )}
            {row.map((key) => (
              <motion.button
                key={key}
                className="px-3 py-2.5 rounded text-sm font-medium"
                style={{
                  background: key === '✓'
                    ? 'var(--color-accent)'
                    : 'var(--color-surface-raised)',
                  color: key === '✓' ? 'var(--color-bg)' : 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                  minWidth: key === ' ' ? '8rem' : '2.5rem'
                }}
                onClick={() => handleKey(key)}
                whileTap={{ scale: 0.92 }}
              >
                {key === ' ' ? 'SPACE' : key}
              </motion.button>
            ))}
          </div>
        ))}
      </div>
    </motion.div>
  )
}

interface OskInputProps {
  value: string
  onChange: (v: string) => void
  onSubmit?: (v: string) => void
  placeholder?: string
  className?: string
  style?: React.CSSProperties
  showOskFromGamepad?: boolean
}

export const OskInput: React.FC<OskInputProps> = ({
  value,
  onChange,
  onSubmit,
  placeholder,
  className,
  style,
  showOskFromGamepad = false
}) => {
  const [showOsk, setShowOsk] = useState(false)

  return (
    <>
      <input
        className={className}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSubmit?.(value)}
        onFocus={() => {
          if (showOskFromGamepad) setShowOsk(true)
        }}
        placeholder={placeholder}
        style={{
          background: 'var(--color-surface-raised)',
          color: 'var(--color-text)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-card)',
          padding: '0.5rem 0.75rem',
          width: '100%',
          outline: 'none',
          ...style
        }}
      />
      <AnimatePresence>
        {showOsk && (
          <OnScreenKeyboard
            value={value}
            onChange={onChange}
            onClose={() => setShowOsk(false)}
            label={placeholder}
          />
        )}
      </AnimatePresence>
    </>
  )
}
