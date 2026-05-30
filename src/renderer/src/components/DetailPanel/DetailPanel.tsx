import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface DetailPanelProps {
  open: boolean
  onClose: () => void
  title: string
  coverUrl?: string
  backdropUrl?: string
  description?: string
  metadata?: { label: string; value: string }[]
  actions?: React.ReactNode
  children?: React.ReactNode
}

export const DetailPanel: React.FC<DetailPanelProps> = ({
  open,
  onClose,
  title,
  coverUrl,
  backdropUrl,
  description,
  metadata,
  actions,
  children
}) => {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/60 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed right-0 top-0 bottom-0 z-50 flex flex-col overflow-hidden"
            style={{
              width: 'min(480px, 90vw)',
              background: 'var(--color-surface-overlay)',
              backdropFilter: 'blur(var(--blur-panel))',
              borderLeft: '1px solid var(--color-border)'
            }}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            {backdropUrl && (
              <div className="relative h-48 overflow-hidden flex-shrink-0">
                <img
                  src={backdropUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[var(--color-surface-overlay)]" />
              </div>
            )}

            <div className="flex gap-4 p-4 flex-shrink-0">
              {coverUrl && (
                <img
                  src={coverUrl}
                  alt={title}
                  className="w-24 h-36 object-cover rounded-[var(--radius-card)] flex-shrink-0"
                  style={{ boxShadow: 'var(--shadow-card)' }}
                />
              )}
              <div className="flex flex-col justify-end gap-1 min-w-0">
                <h2
                  className="text-xl font-bold leading-tight"
                  style={{ color: 'var(--color-text)' }}
                >
                  {title}
                </h2>
                {metadata?.slice(0, 3).map((m) => (
                  <div key={m.label} className="flex gap-1 text-sm">
                    <span style={{ color: 'var(--color-text-dim)' }}>{m.label}:</span>
                    <span style={{ color: 'var(--color-text)' }}>{m.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {actions && (
              <div className="flex gap-2 px-4 pb-3 flex-shrink-0 flex-wrap">
                {actions}
              </div>
            )}

            <div
              className="flex-1 overflow-y-auto px-4 pb-4 gpu-scroll"
              style={{ color: 'var(--color-text-dim)' }}
            >
              {description && (
                <p className="text-sm leading-relaxed mb-4">{description}</p>
              )}
              {metadata && metadata.length > 3 && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm mb-4">
                  {metadata.slice(3).map((m) => (
                    <React.Fragment key={m.label}>
                      <span style={{ color: 'var(--color-text-dim)' }}>{m.label}</span>
                      <span style={{ color: 'var(--color-text)' }}>{m.value}</span>
                    </React.Fragment>
                  ))}
                </div>
              )}
              {children}
            </div>

            <button
              className="absolute top-3 right-3 p-2 rounded-full hover:bg-white/10 transition-colors"
              onClick={onClose}
              aria-label="Close"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
