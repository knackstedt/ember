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

    cancelAnimationFrame(animRef.current)
    let w = (canvas.width = window.innerWidth)
    let h = (canvas.height = window.innerHeight)

    if (theme === 'dark-oled') {
      const drawStars = (): void => {
        ctx.clearRect(0, 0, w, h)
        const count = Math.floor((w * h) / 3000)
        for (let i = 0; i < count; i++) {
          ctx.beginPath()
          ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 1.2, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(255,255,255,${(0.05 + Math.random() * 0.2).toFixed(2)})`
          ctx.fill()
        }
      }
      const onResize = (): void => {
        w = canvas.width = window.innerWidth
        h = canvas.height = window.innerHeight
        drawStars()
      }
      drawStars()
      window.addEventListener('resize', onResize)
      return () => window.removeEventListener('resize', onResize)
    }

    const onResize = (): void => {
      w = canvas.width = window.innerWidth
      h = canvas.height = window.innerHeight
    }
    window.addEventListener('resize', onResize)

    if (theme === 'glassmorphism') {
      const hues = [200, 220, 240, 260, 280, 300]
      const orbs = Array.from({ length: 6 }, (_, i) => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: 200 + Math.random() * 200,
        hue: hues[i],
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
      let scanY = 0
      const CYCLE_FRAMES = 480 // ~8s at 60fps

      const draw = (): void => {
        ctx.clearRect(0, 0, w, h)
        scanY = (scanY + h / CYCLE_FRAMES) % h

        const halo = ctx.createLinearGradient(0, scanY - 10, 0, scanY + 10)
        halo.addColorStop(0, 'transparent')
        halo.addColorStop(0.5, 'rgba(255,45,120,0.07)')
        halo.addColorStop(1, 'transparent')
        ctx.fillStyle = halo
        ctx.fillRect(0, scanY - 10, w, 20)

        ctx.strokeStyle = 'rgba(255,45,120,0.85)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(0, Math.round(scanY))
        ctx.lineTo(w, Math.round(scanY))
        ctx.stroke()

        animRef.current = requestAnimationFrame(draw)
      }
      draw()
    } else if (theme === 'terminal-tui') {
      const FONT_SIZE = 14
      const cols = Math.floor(w / FONT_SIZE)
      const chars = '01アイウエオカキクケコサシスセソABCDEFGHIJKLMNOP'.split('')
      const drops = Array.from({ length: cols }, () => Math.random() * -(h / FONT_SIZE))

      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)

      const draw = (): void => {
        ctx.fillStyle = 'rgba(0,0,0,0.05)'
        ctx.fillRect(0, 0, w, h)
        ctx.font = `${FONT_SIZE}px monospace`

        for (let i = 0; i < drops.length; i++) {
          const ch = chars[Math.floor(Math.random() * chars.length)]
          const x = i * FONT_SIZE
          const y = drops[i] * FONT_SIZE

          ctx.fillStyle = 'rgba(180,255,180,0.95)'
          ctx.fillText(ch, x, y)

          if (y > h && Math.random() > 0.975) drops[i] = 0
          drops[i] += 0.5
        }

        animRef.current = requestAnimationFrame(draw)
      }
      draw()
    }

    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', onResize)
    }
  }, [theme])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}
    />
  )
}
