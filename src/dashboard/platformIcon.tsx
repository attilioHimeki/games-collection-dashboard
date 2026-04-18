import type { CSSProperties } from 'react'

type IconSpec = { bg: string; fg: string; text: string }

function normalize(s: string): string {
  return s.trim().toLowerCase()
}

function pickIcon(platform: string): IconSpec {
  const p = normalize(platform)

  if (p.includes('xbox')) return { bg: '#0ea54c', fg: '#07140d', text: 'X' }
  if (p.includes('n-gage') || p.includes('ngage')) return { bg: '#1f6feb', fg: '#071021', text: 'N' }
  if (p.includes('playstation') || p === 'psp' || p.includes('ps vita') || p.startsWith('ps '))
    return { bg: '#1f6feb', fg: '#071021', text: 'PS' }
  if (p.includes('nintendo') || p.includes('gamecube') || p.includes('gameboy') || p.includes('wii'))
    return { bg: '#ff4d5e', fg: '#1a0a0d', text: 'N' }
  if (p.includes('sega') || p.includes('dreamcast')) return { bg: '#29c6d1', fg: '#061316', text: 'S' }
  if (p === 'pc') return { bg: '#9ca3af', fg: '#0b1020', text: 'PC' }

  return { bg: '#a78bfa', fg: '#0b1020', text: '?' }
}

export function PlatformIcon({ platform, size = 22 }: { platform: string; size?: number }) {
  const spec = pickIcon(platform)
  const style: CSSProperties = { display: 'inline-flex', width: size, height: size, flex: '0 0 auto' }

  return (
    <span style={style} aria-hidden="true">
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        role="presentation"
        focusable="false"
      >
        <rect x="1" y="1" width="22" height="22" rx="7" fill={spec.bg} />
        <text
          x="12"
          y="12.5"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={spec.fg}
          fontSize={spec.text.length > 1 ? 9 : 11}
          fontWeight="700"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
          letterSpacing={spec.text.length > 1 ? 0.5 : 0}
        >
          {spec.text}
        </text>
      </svg>
    </span>
  )
}

