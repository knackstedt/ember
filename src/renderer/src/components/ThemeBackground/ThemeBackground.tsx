import React, { useEffect, useRef } from 'react'
import { useSettingsStore } from '../../store/settings.store'

export const ThemeBackground: React.FC = () => {
  const theme = useSettingsStore((s) => s.settings?.theme ?? 'dark-oled')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = 0, h = 0

    const resize = (): void => {
      w = canvas.width = window.innerWidth
      h = canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    cancelAnimationFrame(animRef.current)

    if (theme === 'glassmorphism') {
      const orbs = Array.from({ length: 4 }, (_, i) => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: 200 + Math.random() * 200,
        hue: [200, 220, 260, 280][i]
      }))

      const draw = (): void => {
        ctx.clearRect(0, 0, w, h)
        for (const orb of orbs) {
          orb.x += orb.vx
          orb.y += orb.vy
          if (orb.x < -orb.r) orb.x = w + orb.r
          if (orb.x > w + orb.r) orb.x = -orb.r
          if (orb.y < -orb.r) orb.y = h + orb.r
          if (orb.y > h + orb.r) orb.y = -orb.r

          const grd = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.r)
          grd.addColorStop(0, `hsla(${orb.hue},80%,60%,0.12)`)
          grd.addColorStop(1, 'transparent')
          ctx.fillStyle = grd
          ctx.beginPath()
          ctx.arc(orb.x, orb.y, orb.r, 0, Math.PI * 2)
          ctx.fill()
        }
        animRef.current = requestAnimationFrame(draw)
      }
      draw()
    } else if (theme === 'neon-cyberpunk') {
      let t = 0
      const lines = Array.from({ length: 8 }, (_, i) => ({
        y: (h / 8) * i,
        speed: 0.2 + Math.random() * 0.4,
        alpha: 0.03 + Math.random() * 0.05
      }))

      const draw = (): void => {
        ctx.clearRect(0, 0, w, h)
        t += 0.01

        for (const line of lines) {
          line.y += line.speed
          if (line.y > h) line.y = 0
          const grd = ctx.createLinearGradient(0, line.y, w, line.y)
          grd.addColorStop(0, 'transparent')
          grd.addColorStop(0.5, `rgba(255,45,120,${line.alpha})`)
          grd.addColorStop(1, 'transparent')
          ctx.fillStyle = grd
          ctx.fillRect(0, line.y, w, 1)
        }

        const pulse = Math.sin(t) * 0.02 + 0.03
        const grd2 = ctx.createRadialGradient(w * 0.5, h, 0, w * 0.5, h, w * 0.8)
        grd2.addColorStop(0, `rgba(160,32,240,${pulse})`)
        grd2.addColorStop(1, 'transparent')
        ctx.fillStyle = grd2
        ctx.fillRect(0, 0, w, h)

        animRef.current = requestAnimationFrame(draw)
      }
      draw()
    } else if (theme === 'terminal-tui') {
      const chars = '01アイウエオカキクケコサシスセソ'.split('')
      const cols = Math.floor(w / 14)
      const drops = Array.from({ length: cols }, () => Math.random() * -50)

      const draw = (): void => {
        ctx.fillStyle = 'rgba(0,0,0,0.05)'
        ctx.fillRect(0, 0, w, h)
        ctx.fillStyle = 'rgba(0,255,65,0.15)'
        ctx.font = '12px monospace'
        for (let i = 0; i < cols; i++) {
          const ch = chars[Math.floor(Math.random() * chars.length)]
          ctx.fillText(ch, i * 14, drops[i] * 14)
          if (drops[i] * 14 > h && Math.random() > 0.975) drops[i] = 0
          drops[i]++
        }
        animRef.current = requestAnimationFrame(draw)
      }
      draw()
    }

    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [theme])

  if (theme === 'dark-oled') return null

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0, opacity: 1 }}
    />
  )
}
