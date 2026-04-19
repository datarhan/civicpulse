import { Fragment, useEffect, useMemo, useState } from 'react'

const CITIES = [
  { id: 'puertollano', name: 'Puertollano', mhs: 78 },
  { id: 'valdepenas',  name: 'Valdepeñas',  mhs: 71 },
  { id: 'tomelloso',   name: 'Tomelloso',   mhs: 82 },
]

const PLAY_MODES = [
  { id: 'citizen',    name: 'Ciudadano',  icon: '👤', desc: 'Actividad + pulso diario' },
  { id: 'watchdog',   name: 'Vigilante',  icon: '👁', desc: 'Promesas + gastos sospechosos' },
  { id: 'journalist', name: 'Periodista', icon: '✎',  desc: 'Anomalías + historias' },
  { id: 'official',   name: 'Cargo',      icon: '★',  desc: 'KPIs operacionales' },
]

const OVERLAYS = [
  { id: 'activity', name: 'Actividad', hint: 'Quejas en vivo + resoluciones' },
  { id: 'budget',   name: '€ flujo',   hint: 'Cada gasto como partícula' },
  { id: 'promises', name: 'Promesas',  hint: 'Calor por cumplimiento' },
  { id: 'health',   name: 'Salud',     hint: 'Índice por barrio' },
]

const BLOCKS = [
  { r: 0, c: 0, t: 'park', h: 6 },   { r: 0, c: 1, t: 'res', h: 24, lit: true }, { r: 0, c: 2, t: 'res', h: 32 }, { r: 0, c: 3, t: 'com', h: 48 }, { r: 0, c: 4, t: 'com', h: 60, lit: true }, { r: 0, c: 5, t: 'res', h: 36 }, { r: 0, c: 6, t: 'park', h: 6 }, { r: 0, c: 7, t: 'res', h: 22 },
  { r: 1, c: 0, t: 'res', h: 28 },   { r: 1, c: 1, t: 'civic', h: 42, label: 'Ayto', ping: true }, { r: 1, c: 2, t: 'com', h: 54, lit: true }, { r: 1, c: 3, t: 'com', h: 72, lit: true, ping: true }, { r: 1, c: 4, t: 'com', h: 88, lit: true }, { r: 1, c: 5, t: 'res', h: 40 }, { r: 1, c: 6, t: 'res', h: 30 }, { r: 1, c: 7, t: 'com', h: 46 },
  { r: 2, c: 0, t: 'res', h: 34 },   { r: 2, c: 1, t: 'res', h: 38, ping: true }, { r: 2, c: 2, t: 'park', h: 6 }, { r: 2, c: 3, t: 'civic', h: 36, label: 'Pleno' }, { r: 2, c: 4, t: 'com', h: 66, lit: true }, { r: 2, c: 5, t: 'com', h: 52 }, { r: 2, c: 6, t: 'res', h: 34, lit: true }, { r: 2, c: 7, t: 'res', h: 28 },
  { r: 3, c: 0, t: 'ind', h: 26, smoke: true }, { r: 3, c: 1, t: 'ind', h: 30, smoke: true }, { r: 3, c: 2, t: 'res', h: 42 }, { r: 3, c: 3, t: 'park', h: 6 }, { r: 3, c: 4, t: 'com', h: 78, lit: true }, { r: 3, c: 5, t: 'com', h: 60 }, { r: 3, c: 6, t: 'res', h: 38 }, { r: 3, c: 7, t: 'res', h: 34, lit: true },
  { r: 4, c: 0, t: 'ind', h: 22 },   { r: 4, c: 1, t: 'res', h: 30 }, { r: 4, c: 2, t: 'res', h: 40, lit: true }, { r: 4, c: 3, t: 'civic', h: 30, label: 'Bibl.' }, { r: 4, c: 4, t: 'com', h: 62, lit: true }, { r: 4, c: 5, t: 'com', h: 52 }, { r: 4, c: 6, t: 'park', h: 6 }, { r: 4, c: 7, t: 'res', h: 30 },
  { r: 5, c: 0, t: 'res', h: 28 },   { r: 5, c: 1, t: 'res', h: 32 }, { r: 5, c: 2, t: 'com', h: 48, lit: true }, { r: 5, c: 3, t: 'res', h: 40 }, { r: 5, c: 4, t: 'res', h: 34 }, { r: 5, c: 5, t: 'res', h: 26, ping: true }, { r: 5, c: 6, t: 'res', h: 28 }, { r: 5, c: 7, t: 'park', h: 6 },
  { r: 6, c: 0, t: 'park', h: 6 },   { r: 6, c: 1, t: 'res', h: 24 }, { r: 6, c: 2, t: 'res', h: 28 }, { r: 6, c: 3, t: 'res', h: 34, lit: true }, { r: 6, c: 4, t: 'res', h: 30 }, { r: 6, c: 5, t: 'res', h: 28 }, { r: 6, c: 6, t: 'res', h: 26 }, { r: 6, c: 7, t: 'res', h: 24 },
  { r: 7, c: 0, t: 'res', h: 22 },   { r: 7, c: 1, t: 'park', h: 6 }, { r: 7, c: 2, t: 'res', h: 26 }, { r: 7, c: 3, t: 'res', h: 24 }, { r: 7, c: 4, t: 'res', h: 32 }, { r: 7, c: 5, t: 'res', h: 28 }, { r: 7, c: 6, t: 'res', h: 24, lit: true }, { r: 7, c: 7, t: 'res', h: 22 },
]

const COLORS = {
  res:   { top: '#E8D9B8', front: '#C9B68A', side: '#AE9A6E' },
  com:   { top: '#D8E0EC', front: '#9CAFC8', side: '#7D8FA8' },
  civic: { top: '#F5CC88', front: '#E0A94B', side: '#B8862F' },
  ind:   { top: '#B7BAC0', front: '#8F9298', side: '#6B6E74' },
  park:  { top: '#9FC07A', front: '#86A866', side: '#6B8B4E' },
}

function Iso({ blocks, pings, particles, speed, overlay }) {
  const TW = 44
  const TH = 22
  const GRID = 8
  const originX = GRID * TW
  const originY = 40

  const ord = [...blocks].sort((a, b) => (a.r + a.c) - (b.r + b.c))
  const toScreen = (r, c) => ({ x: originX + (c - r) * TW, y: originY + (c + r) * TH })

  return (
    <svg
      viewBox={`0 -30 ${GRID * TW * 2 + 80} ${GRID * TH * 2 + 200}`}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        filter: 'drop-shadow(0 30px 60px rgba(0,0,0,.25))',
      }}
    >
      <defs>
        <radialGradient id="ground-glow" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#F5EAD2" stopOpacity=".6" />
          <stop offset="100%" stopColor="#F5EAD2" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="smoke-g" x1="0" x2="0" y1="1" y2="0">
          <stop offset="0%" stopColor="#D0D4DA" stopOpacity=".8" />
          <stop offset="100%" stopColor="#D0D4DA" stopOpacity="0" />
        </linearGradient>
      </defs>

      <polygon
        points={`${originX},${originY - 8} ${originX + GRID * TW},${originY + GRID * TH - 8} ${originX},${originY + GRID * TH * 2 - 8} ${originX - GRID * TW},${originY + GRID * TH - 8}`}
        fill="#E0D2A8"
        stroke="#B8A57A"
        strokeWidth="1"
      />
      <ellipse cx={originX} cy={originY + GRID * TH - 8} rx={GRID * TW * 0.9} ry={GRID * TH * 0.7} fill="url(#ground-glow)" />

      {Array.from({ length: GRID + 1 }).map((_, i) => {
        const a = toScreen(i, 0), b = toScreen(i, GRID)
        const c = toScreen(0, i), d = toScreen(GRID, i)
        return (
          <Fragment key={i}>
            <line x1={a.x} y1={a.y - 8} x2={b.x} y2={b.y - 8} stroke="rgba(11,15,25,.07)" strokeWidth=".6" />
            <line x1={c.x} y1={c.y - 8} x2={d.x} y2={d.y - 8} stroke="rgba(11,15,25,.07)" strokeWidth=".6" />
          </Fragment>
        )
      })}

      {Array.from({ length: GRID }).map((_, i) => {
        const a = toScreen(3.5, i), b = toScreen(3.5, i + 1)
        return (
          <polygon
            key={'rr' + i}
            points={`${a.x},${a.y - 8} ${b.x},${b.y - 8} ${b.x},${b.y - 4} ${a.x},${a.y - 4}`}
            fill="#7A8494"
            opacity=".5"
          />
        )
      })}

      {ord.map((b) => {
        const s = toScreen(b.r, b.c)
        const c = COLORS[b.t]
        const h = b.h
        const halfW = TW - 2
        const halfH = TH - 2
        const topPts = [
          [s.x, s.y - h],
          [s.x + halfW, s.y + halfH - h],
          [s.x, s.y + halfH * 2 - h],
          [s.x - halfW, s.y + halfH - h],
        ].map((p) => p.join(',')).join(' ')
        const rightPts = [
          [s.x + halfW, s.y + halfH - h],
          [s.x, s.y + halfH * 2 - h],
          [s.x, s.y + halfH * 2],
          [s.x + halfW, s.y + halfH],
        ].map((p) => p.join(',')).join(' ')
        const leftPts = [
          [s.x - halfW, s.y + halfH - h],
          [s.x, s.y + halfH * 2 - h],
          [s.x, s.y + halfH * 2],
          [s.x - halfW, s.y + halfH],
        ].map((p) => p.join(',')).join(' ')
        return (
          <g key={`${b.r}-${b.c}`}>
            <polygon points={rightPts} fill={c.side} />
            <polygon points={leftPts} fill={c.front} />
            <polygon points={topPts} fill={c.top} stroke={c.side} strokeWidth=".4" />
            {b.t === 'com' && h > 20 && (
              <>
                {Array.from({ length: Math.floor(h / 10) }).map((_, i) => (
                  <Fragment key={i}>
                    <rect
                      x={s.x - halfW * 0.55}
                      y={s.y + halfH * 0.2 - h + i * 10 + 2}
                      width={halfW * 0.5}
                      height="2.5"
                      fill={b.lit ? '#FFD580' : 'rgba(11,15,25,.35)'}
                      opacity=".85"
                    />
                    <rect
                      x={s.x + halfW * 0.05}
                      y={s.y + halfH * 0.2 - h + i * 10 + 2}
                      width={halfW * 0.5}
                      height="2.5"
                      fill={b.lit ? '#FFD580' : 'rgba(11,15,25,.35)'}
                      opacity=".85"
                    />
                  </Fragment>
                ))}
              </>
            )}
            {b.t === 'civic' && b.label && (
              <text
                x={s.x}
                y={s.y + halfH - h - 3}
                textAnchor="middle"
                fontSize="5"
                fontWeight="700"
                fill="#6B4B1A"
                fontFamily="DM Mono"
              >
                {b.label}
              </text>
            )}
            {b.t === 'res' && b.lit && (
              <rect x={s.x - 4} y={s.y - h - 2} width="8" height="2" fill="#F5B544" opacity=".9" />
            )}
            {b.t === 'park' && (
              <>
                <circle cx={s.x - 12} cy={s.y + halfH - 8} r="4" fill="#7FA85D" />
                <circle cx={s.x + 10} cy={s.y + halfH - 6} r="5" fill="#89B466" />
                <circle cx={s.x - 2} cy={s.y + halfH - 12} r="3.5" fill="#9CC176" />
              </>
            )}
            {b.smoke && (
              <ellipse cx={s.x} cy={s.y - h - 10} rx="6" ry="10" fill="url(#smoke-g)">
                <animate
                  attributeName="cy"
                  values={`${s.y - h - 10}; ${s.y - h - 30}; ${s.y - h - 10}`}
                  dur="4s"
                  repeatCount="indefinite"
                />
                <animate attributeName="opacity" values="1;0;1" dur="4s" repeatCount="indefinite" />
              </ellipse>
            )}
          </g>
        )
      })}

      {pings.map((p, i) => {
        const s = toScreen(p.r, p.c)
        const c =
          p.sev === 'crit' ? '#F87171' : p.sev === 'warn' ? '#FBBF24' : p.sev === 'ok' ? '#4ADE80' : '#60A5FA'
        return (
          <g key={i} style={{ pointerEvents: 'none' }}>
            <circle cx={s.x} cy={s.y - p.h - 10} r="4" fill={c} stroke="white" strokeWidth="1">
              <animate attributeName="r" values="3;6;3" dur={`${2 / speed}s`} repeatCount="indefinite" />
            </circle>
            <circle cx={s.x} cy={s.y - p.h - 10} r="4" fill="none" stroke={c} strokeWidth=".5">
              <animate attributeName="r" values="4;18;4" dur={`${2 / speed}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" values="1;0;1" dur={`${2 / speed}s`} repeatCount="indefinite" />
            </circle>
          </g>
        )
      })}

      {overlay === 'budget' &&
        particles.map((p, i) => {
          const from = toScreen(p.from.r, p.from.c)
          const to = toScreen(p.to.r, p.to.c)
          return (
            <circle key={i} r="2.5" fill={p.color}>
              <animate
                attributeName="cx"
                values={`${from.x};${to.x}`}
                dur={`${3 / speed}s`}
                repeatCount="indefinite"
                begin={`${i * 0.3}s`}
              />
              <animate
                attributeName="cy"
                values={`${from.y - 10};${to.y - 10}`}
                dur={`${3 / speed}s`}
                repeatCount="indefinite"
                begin={`${i * 0.3}s`}
              />
              <animate
                attributeName="opacity"
                values="0;1;1;0"
                dur={`${3 / speed}s`}
                repeatCount="indefinite"
                begin={`${i * 0.3}s`}
              />
            </circle>
          )
        })}
    </svg>
  )
}

function MiniBar({ data, color }) {
  const max = Math.max(...data)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1.5, height: 14, marginTop: 4 }}>
      {data.map((v, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: (v / max * 100) + '%',
            background: color,
            opacity: 0.3 + (i / data.length) * 0.7,
            borderRadius: '1px 1px 0 0',
            minHeight: 1,
          }}
        />
      ))}
    </div>
  )
}

function Pod({ label, value, delta, tone = 'ok', trend }) {
  const color =
    tone === 'ok' ? '#4ADE80' : tone === 'warn' ? '#FBBF24' : tone === 'crit' ? '#F87171' : '#60A5FA'
  return (
    <div
      style={{
        background: 'rgba(14,20,34,.82)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        border: '1px solid rgba(96,165,250,.18)',
        borderRadius: 10,
        padding: '10px 14px',
        color: 'white',
        minWidth: 130,
        boxShadow: '0 8px 24px rgba(0,0,0,.4)',
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 9.5,
          color: 'rgba(255,255,255,.55)',
          textTransform: 'uppercase',
          letterSpacing: '.12em',
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 3 }}>
        <div className="mono" style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: '-.01em' }}>
          {value}
        </div>
        {delta !== undefined && (
          <span
            className="mono"
            style={{
              fontSize: 10,
              color: delta >= 0 ? '#4ADE80' : '#F87171',
              fontWeight: 700,
            }}
          >
            {delta >= 0 ? '▲' : '▼'}
            {Math.abs(delta)}
          </span>
        )}
      </div>
      {trend && <MiniBar data={trend} color={color} />}
    </div>
  )
}

function HudBtn({ icon, active }) {
  return (
    <button
      style={{
        width: 38,
        height: 38,
        borderRadius: 8,
        background: active ? 'rgba(245,181,68,.22)' : 'rgba(14,20,34,.82)',
        border: active ? '1px solid rgba(245,181,68,.5)' : '1px solid rgba(96,165,250,.18)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        color: 'white',
        fontSize: 16,
      }}
    >
      {icon}
    </button>
  )
}

function TopHUD({ city, tick }) {
  const clock = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  return (
    <div
      style={{
        position: 'absolute',
        top: 14,
        left: 14,
        right: 14,
        zIndex: 10,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 16,
      }}
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'rgba(14,20,34,.82)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            border: '1px solid rgba(96,165,250,.18)',
            borderRadius: 10,
            padding: '9px 14px',
            color: 'white',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <rect x="1" y="1" width="22" height="22" rx="5" fill="#5B8DEF" />
            <path
              d="M5 13 Q 7 13, 8 11 T 11 8 Q 12 7, 13 10 T 16 14 Q 17 15, 19 13"
              fill="none"
              stroke="white"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
          <div>
            <div
              className="mono"
              style={{ fontSize: 9, color: 'rgba(255,255,255,.6)', letterSpacing: '.1em' }}
            >
              CIUDAD
            </div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{city.name}</div>
          </div>
          <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,.1)', margin: '0 4px' }} />
          <div>
            <div
              className="mono"
              style={{ fontSize: 9, color: 'rgba(255,255,255,.6)', letterSpacing: '.1em' }}
            >
              HORA
            </div>
            <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: '#F5B544' }}>
              {clock} · día {tick}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flex: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Pod label="Salud" value={city.mhs} delta={+2.3} tone="ok" trend={[60, 62, 64, 66, 68, 70, 72, 74, 76, 78]} />
        <Pod label="Quejas" value="312" delta={-3} tone="warn" trend={[20, 28, 24, 30, 26, 32, 28, 30, 24, 22]} />
        <Pod label="€ hoy" value="€47k" delta={+1} tone="info" trend={[10, 18, 22, 28, 30, 35, 40, 42, 45, 47]} />
        <Pod label="Promesas" value="71%" delta={+2} tone="ok" trend={[62, 64, 66, 65, 67, 68, 70, 69, 71, 71]} />
        <Pod label="Gobierno" value="A−" tone="ok" />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <HudBtn icon="⏸" />
        <HudBtn icon="⚡" active />
        <HudBtn icon="⚙" />
      </div>
    </div>
  )
}

function Dock({ tab, onTab, overlay, onOverlay, playMode, onPlayMode }) {
  const TABS = [
    { id: 'city',   name: 'Ciudad',      icon: '🏙' },
    { id: 'quejas', name: 'Quejas',      icon: '⚑' },
    { id: 'budget', name: 'Presupuesto', icon: '€' },
    { id: 'cargos', name: 'Cargos',      icon: '♛' },
    { id: 'plenos', name: 'Plenos',      icon: '⚖' },
  ]
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 14,
        left: 14,
        right: 14,
        zIndex: 10,
        display: 'flex',
        justifyContent: 'space-between',
        gap: 16,
        alignItems: 'flex-end',
        flexWrap: 'wrap',
      }}
    >
      <div
        style={{
          background: 'rgba(14,20,34,.82)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          border: '1px solid rgba(96,165,250,.18)',
          borderRadius: 12,
          padding: 6,
          color: 'white',
        }}
      >
        <div
          className="mono"
          style={{
            fontSize: 9,
            color: 'rgba(255,255,255,.5)',
            letterSpacing: '.1em',
            padding: '6px 10px 4px',
          }}
        >
          MODO DE JUEGO
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {PLAY_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => onPlayMode(m.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                padding: '6px 10px',
                borderRadius: 8,
                minWidth: 70,
                background: playMode === m.id ? 'rgba(91,141,239,.3)' : 'transparent',
                border: playMode === m.id ? '1px solid rgba(91,141,239,.7)' : '1px solid transparent',
                color: playMode === m.id ? 'white' : 'rgba(255,255,255,.7)',
              }}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>{m.icon}</span>
              <span style={{ fontSize: 10.5, fontWeight: 600 }}>{m.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
        <div
          style={{
            background: 'rgba(14,20,34,.82)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            border: '1px solid rgba(96,165,250,.18)',
            borderRadius: 12,
            padding: 6,
            display: 'flex',
            gap: 4,
          }}
        >
          {OVERLAYS.map((o) => (
            <button
              key={o.id}
              onClick={() => onOverlay(o.id)}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                background: overlay === o.id ? '#F5B544' : 'transparent',
                color: overlay === o.id ? '#0B0F19' : 'rgba(255,255,255,.75)',
                fontWeight: overlay === o.id ? 700 : 500,
                fontSize: 11.5,
              }}
            >
              {o.name}
            </button>
          ))}
        </div>

        <div
          style={{
            background: 'rgba(14,20,34,.82)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            border: '1px solid rgba(96,165,250,.18)',
            borderRadius: 12,
            padding: 6,
            display: 'flex',
            gap: 4,
            color: 'white',
          }}
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => onTab(t.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 14px',
                borderRadius: 8,
                background: tab === t.id ? '#5B8DEF' : 'transparent',
                color: tab === t.id ? 'white' : 'rgba(255,255,255,.75)',
                fontWeight: tab === t.id ? 700 : 500,
                fontSize: 13,
              }}
            >
              <span style={{ fontSize: 15 }}>{t.icon}</span>
              {t.name}
            </button>
          ))}
        </div>
      </div>

      <div style={{ width: 280 }} />
    </div>
  )
}

function EventTicker({ events }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 110,
        left: 14,
        width: 290,
        zIndex: 9,
        background: 'rgba(14,20,34,.82)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        border: '1px solid rgba(96,165,250,.18)',
        borderRadius: 12,
        color: 'white',
        padding: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <div
            className="mono"
            style={{ fontSize: 9, color: 'rgba(255,255,255,.55)', letterSpacing: '.1em' }}
          >
            TIEMPO REAL
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>Pulso de la ciudad</div>
        </div>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 10,
            color: '#4ADE80',
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: '#4ADE80',
              animation: 'hudPulse 1.5s infinite',
            }}
          />
          LIVE
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 9,
          maxHeight: 280,
          overflowY: 'auto',
        }}
      >
        {events.map((e, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              gap: 10,
              paddingBottom: 9,
              borderBottom: i === events.length - 1 ? 'none' : '1px solid rgba(255,255,255,.06)',
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                flexShrink: 0,
                borderRadius: 6,
                display: 'grid',
                placeItems: 'center',
                fontSize: 11,
                background:
                  e.sev === 'crit' ? 'rgba(248,113,113,.2)' :
                  e.sev === 'warn' ? 'rgba(251,191,36,.2)' :
                  e.sev === 'ok'   ? 'rgba(74,222,128,.2)' :
                                     'rgba(96,165,250,.2)',
                color:
                  e.sev === 'crit' ? '#F87171' :
                  e.sev === 'warn' ? '#FBBF24' :
                  e.sev === 'ok'   ? '#4ADE80' :
                                     '#60A5FA',
              }}
            >
              {e.ico}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.3 }}>{e.text}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 2, fontSize: 10, color: 'rgba(255,255,255,.5)' }}>
                <span className="mono">{e.t}</span>
                <span>·</span>
                <span>{e.dept}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const MODE_DATA = {
  citizen: {
    title: '3 quejas cerca de ti',
    items: [
      { icon: '⚑', text: 'Contenedores Mayor 34',    meta: 'a 180 m · hace 2 h', tone: 'warn' },
      { icon: '⚑', text: 'Bache Ronda del Sur',      meta: 'a 320 m · hace 3 h', tone: 'crit' },
      { icon: '⚑', text: 'Farola Pl. Constitución',  meta: 'a 90 m · hace 4 h',  tone: 'info' },
    ],
    footer: { label: 'Tu aportación este mes', value: '3 quejas · 2 resueltas', cta: 'Reportar algo' },
  },
  watchdog: {
    title: '🚨 5 anomalías detectadas',
    items: [
      { icon: '€', text: 'Contrato limpieza +28% vs 2024', meta: 'Silva SA · sospechoso', tone: 'crit' },
      { icon: '◷', text: 'Promesa 48 h — fallando',         meta: 'R. Silva · 41% cumplimiento', tone: 'warn' },
      { icon: '※', text: 'Pleno: voto en contra inesperado', meta: 'Cesión Parque Sur', tone: 'crit' },
      { icon: '€', text: 'Gasto no explicado €84k',         meta: 'Partida 632 · revisar', tone: 'warn' },
      { icon: '⛒', text: 'Plantilla: 3 plazas vacantes >6 m', meta: 'Medio Ambiente', tone: 'warn' },
    ],
    footer: { label: 'Nivel de escrutinio', value: 'ALTO · 12 hilos abiertos', cta: 'Nueva investigación' },
  },
  journalist: {
    title: 'Historias que escribirías hoy',
    items: [
      { icon: '📰', text: 'El concejal que no contesta el teléfono', meta: '41% respuesta en 48 h', tone: 'crit' },
      { icon: '📈', text: 'Los €1.24M del asfaltado: quién gana',     meta: '4 licitadores · 1 gana siempre', tone: 'warn' },
      { icon: '🗳', text: 'La moción que dividió al pleno',           meta: 'ZBE 11–10 · Pop. dividido', tone: 'info' },
      { icon: '🌳', text: 'Reciclaje: donde los puntos sí llegan',    meta: '83% instalados · mapa', tone: 'ok' },
    ],
    footer: { label: 'Datos bruto hoy', value: '248 filas nuevas', cta: 'Exportar CSV' },
  },
  official: {
    title: 'Tu día · Carmen Ruiz',
    items: [
      { icon: '⚠', text: '12 incidencias sin asignar',      meta: 'SLA vence hoy', tone: 'crit' },
      { icon: '€', text: 'Adjudicación alumbrado LED',       meta: 'firmar antes 18:00', tone: 'warn' },
      { icon: '◊', text: 'Pleno 18:00 · tu intervención 3',  meta: '3 minutos', tone: 'info' },
      { icon: '✓', text: 'Parque Pozo Norte · visita',       meta: 'obra 62% completa', tone: 'ok' },
    ],
    footer: { label: 'Tu score semanal', value: '81 ▲ 3', cta: 'Ver dashboard' },
  },
}

function RightPanel({ mode }) {
  const d = MODE_DATA[mode] || MODE_DATA.citizen
  return (
    <div
      style={{
        position: 'absolute',
        top: 110,
        right: 14,
        width: 320,
        zIndex: 9,
        background: 'rgba(14,20,34,.82)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        border: '1px solid rgba(96,165,250,.18)',
        borderRadius: 12,
        color: 'white',
        padding: 14,
      }}
    >
      <div className="mono" style={{ fontSize: 9, color: 'rgba(255,255,255,.55)', letterSpacing: '.1em' }}>
        MODO · {PLAY_MODES.find((m) => m.id === mode).name.toUpperCase()}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, marginTop: 3, letterSpacing: '-.01em' }}>{d.title}</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
        {d.items.map((it, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              gap: 10,
              padding: '10px 10px',
              borderRadius: 8,
              background: 'rgba(255,255,255,.03)',
              border: '1px solid rgba(255,255,255,.05)',
            }}
          >
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 6,
                flexShrink: 0,
                display: 'grid',
                placeItems: 'center',
                fontSize: 13,
                background:
                  it.tone === 'crit' ? 'rgba(248,113,113,.15)' :
                  it.tone === 'warn' ? 'rgba(251,191,36,.15)' :
                  it.tone === 'ok'   ? 'rgba(74,222,128,.15)' :
                                       'rgba(96,165,250,.15)',
                color:
                  it.tone === 'crit' ? '#F87171' :
                  it.tone === 'warn' ? '#FBBF24' :
                  it.tone === 'ok'   ? '#4ADE80' :
                                       '#60A5FA',
              }}
            >
              {it.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{it.text}</div>
              <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.55)', marginTop: 2 }}>{it.meta}</div>
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 14,
          padding: '12px',
          borderRadius: 8,
          background: 'linear-gradient(135deg, rgba(245,181,68,.18), rgba(91,141,239,.18))',
          border: '1px solid rgba(245,181,68,.2)',
        }}
      >
        <div
          className="mono"
          style={{ fontSize: 9.5, color: 'rgba(255,255,255,.6)', letterSpacing: '.1em' }}
        >
          {d.footer.label.toUpperCase()}
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 3 }}>{d.footer.value}</div>
        <button
          style={{
            marginTop: 10,
            padding: '7px 12px',
            borderRadius: 6,
            background: '#F5B544',
            color: '#0B0F19',
            fontWeight: 700,
            fontSize: 11.5,
            width: '100%',
          }}
        >
          {d.footer.cta} →
        </button>
      </div>
    </div>
  )
}

function Drawer({ open, onClose, title, children }) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 20, pointerEvents: open ? 'auto' : 'none' }}>
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,.35)',
          opacity: open ? 1 : 0,
          transition: 'opacity .2s',
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 'min(720px, 68vw)',
          background: '#0E1422',
          borderLeft: '1px solid rgba(96,165,250,.2)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform .28s cubic-bezier(.2,.8,.2,1)',
          color: 'white',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid rgba(255,255,255,.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.01em' }}>{title}</div>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'rgba(255,255,255,.08)',
              color: 'white',
              fontSize: 16,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>{children}</div>
      </div>
    </div>
  )
}

function QuejasPanel() {
  const rows = [
    { id: 'Q-2419', sev: 'warn', text: 'Contenedores C/ Mayor 34',     dept: 'Limpieza',  age: '2 h' },
    { id: 'Q-2418', sev: 'crit', text: 'Bache Ronda del Sur',           dept: 'Obras',     age: '3 h' },
    { id: 'Q-2417', sev: 'warn', text: 'Olores Pol. Industrial Este',   dept: 'Medio Amb.', age: '3 h' },
    { id: 'Q-2416', sev: 'info', text: 'Farola Pl. Constitución',       dept: 'Seguridad', age: '4 h' },
    { id: 'Q-2415', sev: 'info', text: 'Pintadas Av. 1º Mayo',          dept: 'Limpieza',  age: '5 h' },
  ]
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { l: 'Entradas hoy', v: '57',  d: '+3'  },
          { l: 'Resueltas hoy',v: '41',  d: '+12' },
          { l: 'Backlog',      v: '312', d: '−3'  },
          { l: 'SLA 48h',      v: '68%', d: '−4'  },
        ].map((s, i) => (
          <div
            key={i}
            style={{
              padding: '14px 16px',
              background: 'rgba(255,255,255,.04)',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,.06)',
            }}
          >
            <div
              className="mono"
              style={{ fontSize: 10, color: 'rgba(255,255,255,.55)', letterSpacing: '.08em' }}
            >
              {s.l}
            </div>
            <div className="mono" style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>
              {s.v} <span style={{ fontSize: 11, color: '#4ADE80' }}>{s.d}</span>
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          background: 'rgba(255,255,255,.04)',
          borderRadius: 10,
          border: '1px solid rgba(255,255,255,.06)',
          overflow: 'hidden',
        }}
      >
        {rows.map((r, i) => (
          <div
            key={r.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '72px 1fr 130px 60px',
              padding: '14px 16px',
              borderBottom: i === rows.length - 1 ? 'none' : '1px solid rgba(255,255,255,.06)',
              alignItems: 'center',
            }}
          >
            <span className="mono" style={{ fontSize: 11, color: 'rgba(255,255,255,.5)' }}>{r.id}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: r.sev === 'crit' ? '#F87171' : r.sev === 'warn' ? '#FBBF24' : '#60A5FA',
                }}
              />
              <span style={{ fontSize: 13, fontWeight: 500 }}>{r.text}</span>
            </div>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,.6)' }}>{r.dept}</span>
            <span
              className="mono"
              style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', textAlign: 'right' }}
            >
              {r.age}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function BudgetPanel() {
  const flows = [
    { to: 'Personal',   pct: 38, eur: 185, color: '#5B8DEF' },
    { to: 'Obras',      pct: 22, eur: 107, color: '#B084EE' },
    { to: 'Servicios',  pct: 15, eur:  73, color: '#4ADE80' },
    { to: 'Deuda',      pct: 10, eur:  49, color: '#FBBF24' },
    { to: 'Cultura',    pct:  7, eur:  34, color: '#22D3EE' },
    { to: 'Otros',      pct:  8, eur:  39, color: '#94A3B8' },
  ]
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div
          className="mono"
          style={{ fontSize: 10, color: 'rgba(255,255,255,.55)', letterSpacing: '.08em' }}
        >
          TUS €487 DE IBI SE GASTAN ASÍ
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4, letterSpacing: '-.015em' }}>
          Cada euro, rastreado
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,.65)', marginTop: 4 }}>
          Los "particles" que ves flotando en la ciudad son pagos reales ejecutándose en este momento.
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {flows.map((f, i) => (
          <div key={i}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 13 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: f.color }} />
              <span style={{ flex: 1, fontWeight: 600 }}>{f.to}</span>
              <span className="mono" style={{ fontSize: 18, fontWeight: 800 }}>€{f.eur}</span>
              <span
                className="mono"
                style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', width: 36, textAlign: 'right' }}
              >
                {f.pct}%
              </span>
            </div>
            <div
              style={{
                height: 6,
                background: 'rgba(255,255,255,.08)',
                borderRadius: 6,
                marginTop: 6,
                overflow: 'hidden',
              }}
            >
              <div style={{ height: '100%', width: f.pct * 2.5 + '%', background: f.color, borderRadius: 6 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CargosPanel() {
  const people = [
    { n: 'Roberto Silva', r: 'Limpieza',         s: 64, c: 'E' },
    { n: 'Carmen Ruiz',   r: 'Obras',            s: 81, c: 'A' },
    { n: 'Javier Moreno', r: 'Medio Amb.',       s: 72, c: 'B' },
    { n: 'Elena Castro',  r: 'Seguridad',        s: 85, c: 'A' },
    { n: 'Pablo Herrera', r: 'Cultura',          s: 77, c: 'B' },
    { n: 'Marta Jiménez', r: 'Serv. Sociales',   s: 79, c: 'B' },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {people.map((p, i) => (
        <div
          key={i}
          style={{
            padding: '16px',
            background: 'rgba(255,255,255,.04)',
            border: '1px solid rgba(255,255,255,.06)',
            borderRadius: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background:
                  p.s >= 80 ? 'rgba(74,222,128,.2)' :
                  p.s >= 70 ? 'rgba(96,165,250,.2)' :
                              'rgba(251,191,36,.2)',
                color:
                  p.s >= 80 ? '#4ADE80' :
                  p.s >= 70 ? '#60A5FA' :
                              '#FBBF24',
                display: 'grid',
                placeItems: 'center',
                fontSize: 18,
                fontWeight: 800,
              }}
            >
              {p.c}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{p.n}</div>
              <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.55)' }}>{p.r}</div>
            </div>
            <div
              className="mono"
              style={{
                fontSize: 22,
                fontWeight: 800,
                color:
                  p.s >= 80 ? '#4ADE80' :
                  p.s >= 70 ? '#60A5FA' :
                              '#FBBF24',
              }}
            >
              {p.s}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function PlenosPanel() {
  const points = [
    { n: '01', t: 'Aprobación del acta anterior',        type: 'trámite' },
    { n: '02', t: 'Modificación presupuestaria 3/2026',  type: 'votación', hot: true },
    { n: '03', t: 'Adjudicación contrato alumbrado LED', type: 'votación' },
    { n: '04', t: 'Ordenanza ruidos — primera lectura',  type: 'debate',   hot: true },
    { n: '05', t: 'Moción — Zona de Bajas Emisiones',    type: 'moción' },
    { n: '06', t: 'Ruegos y preguntas',                  type: 'abierto' },
  ]
  return (
    <div>
      <div
        style={{
          padding: '18px 20px',
          background: 'linear-gradient(135deg, rgba(245,181,68,.15), rgba(91,141,239,.1))',
          border: '1px solid rgba(245,181,68,.25)',
          borderRadius: 12,
          marginBottom: 20,
        }}
      >
        <div
          className="mono"
          style={{ fontSize: 10, color: '#F5B544', letterSpacing: '.1em', fontWeight: 700 }}
        >
          PRÓXIMA SESIÓN · HOY 18:00
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, letterSpacing: '-.015em' }}>
          Pleno ordinario · 6 puntos
        </div>
        <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.65)', marginTop: 4 }}>
          2 puntos calientes: Modificación presupuestaria 3/2026 · Ordenanza ruidos
        </div>
      </div>
      {points.map((a, i) => (
        <div
          key={i}
          style={{
            display: 'grid',
            gridTemplateColumns: '40px 1fr 100px',
            padding: '14px 0',
            borderBottom: i === points.length - 1 ? 'none' : '1px solid rgba(255,255,255,.06)',
            alignItems: 'center',
          }}
        >
          <span className="mono" style={{ color: 'rgba(255,255,255,.45)', fontWeight: 700 }}>{a.n}</span>
          <div>
            <div style={{ fontWeight: 600 }}>{a.t}</div>
            {a.hot && (
              <span
                style={{
                  display: 'inline-block',
                  marginTop: 4,
                  padding: '2px 7px',
                  background: 'rgba(251,191,36,.2)',
                  color: '#FBBF24',
                  fontSize: 10,
                  fontWeight: 700,
                  borderRadius: 10,
                }}
              >
                CALIENTE
              </span>
            )}
          </div>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', textAlign: 'right' }}>{a.type}</span>
        </div>
      ))}
    </div>
  )
}

export default function Hud() {
  const [tab, setTab] = useState('city')
  const [overlay, setOverlay] = useState('activity')
  const [playMode, setPlayMode] = useState('citizen')
  const [speed] = useState(1)
  const [tick, setTick] = useState(1)
  const [cityId] = useState('puertollano')

  const city = CITIES.find((c) => c.id === cityId) || CITIES[0]

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 6000 / speed)
    return () => clearInterval(id)
  }, [speed])

  const events = useMemo(
    () => [
      { t: 'ahora',  ico: '⚑', text: 'Queja: contenedor C/ Mayor 34',       dept: 'Limpieza',  sev: 'warn' },
      { t: '2 min',  ico: '€', text: 'Pago €14,320 asfaltado Av. 1º Mayo',  dept: 'Obras',     sev: 'info' },
      { t: '7 min',  ico: '⚑', text: 'Bache grave Ronda del Sur',           dept: 'Obras',     sev: 'crit' },
      { t: '12 min', ico: '✓', text: '18 quejas resueltas turno mañana',    dept: 'Limpieza',  sev: 'ok'   },
      { t: '23 min', ico: '◊', text: 'Orden del día pleno publicado',       dept: 'Alcaldía',  sev: 'info' },
      { t: '34 min', ico: '⚑', text: 'Olores Polígono Industrial Este',     dept: 'M. Amb.',   sev: 'warn' },
      { t: '1 h',    ico: '✓', text: '4 puntos reciclaje instalados',       dept: 'M. Amb.',   sev: 'ok'   },
    ],
    []
  )

  const pings = useMemo(
    () => [
      { r: 0, c: 3, h: 48, sev: 'warn' },
      { r: 1, c: 3, h: 72, sev: 'crit' },
      { r: 2, c: 5, h: 52, sev: 'info' },
      { r: 3, c: 0, h: 26, sev: 'warn' },
      { r: 4, c: 4, h: 62, sev: 'ok'   },
      { r: 5, c: 5, h: 26, sev: 'info' },
    ],
    []
  )

  const particles = useMemo(
    () => [
      { from: { r: 1, c: 1 }, to: { r: 3, c: 0 }, color: '#5B8DEF' },
      { from: { r: 1, c: 1 }, to: { r: 0, c: 3 }, color: '#B084EE' },
      { from: { r: 1, c: 1 }, to: { r: 4, c: 3 }, color: '#4ADE80' },
      { from: { r: 1, c: 1 }, to: { r: 2, c: 3 }, color: '#FBBF24' },
      { from: { r: 1, c: 1 }, to: { r: 5, c: 2 }, color: '#22D3EE' },
    ],
    []
  )

  return (
    <div
      data-screen-label="B · City HUD"
      style={{
        position: 'fixed',
        inset: 0,
        background:
          'linear-gradient(180deg, #8FB5D8 0%, #B7CEE2 45%, #C7D4A8 65%, #A5B583 100%)',
        overflow: 'hidden',
        fontFamily: 'Outfit, system-ui, sans-serif',
      }}
    >
      <style>{`@keyframes hudPulse { 0%, 100% { opacity: 1 } 50% { opacity: .3 } }`}</style>

      <svg style={{ position: 'absolute', top: 40, left: 0, width: '100%', height: 120, opacity: 0.7 }}>
        <ellipse cx="200" cy="60" rx="60" ry="18" fill="white" />
        <ellipse cx="250" cy="50" rx="40" ry="14" fill="white" />
        <ellipse cx="800" cy="80" rx="70" ry="18" fill="white" />
        <ellipse cx="850" cy="70" rx="50" ry="16" fill="white" />
        <ellipse cx="1200" cy="50" rx="55" ry="16" fill="white" />
      </svg>

      <div
        style={{
          position: 'absolute',
          top: 70,
          right: 120,
          width: 90,
          height: 90,
          borderRadius: '50%',
          background: 'radial-gradient(circle, #FFE8A8 0%, #F5B544 70%, transparent 100%)',
          filter: 'blur(4px)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          paddingTop: 80,
          paddingBottom: 140,
        }}
      >
        <div style={{ width: 'min(1100px, 90%)', height: '100%' }}>
          <Iso blocks={BLOCKS} pings={pings} particles={particles} speed={speed} overlay={overlay} />
        </div>
      </div>

      <TopHUD city={city} tick={tick} />
      <EventTicker events={events} />
      <RightPanel mode={playMode} />
      <Dock
        tab={tab}
        onTab={setTab}
        overlay={overlay}
        onOverlay={setOverlay}
        playMode={playMode}
        onPlayMode={setPlayMode}
      />

      <Drawer open={tab === 'quejas'} onClose={() => setTab('city')} title="⚑ Quejas · tiempo real">
        <QuejasPanel />
      </Drawer>
      <Drawer open={tab === 'budget'} onClose={() => setTab('city')} title="€ Presupuesto · cada euro">
        <BudgetPanel />
      </Drawer>
      <Drawer open={tab === 'cargos'} onClose={() => setTab('city')} title="♛ Cargos del Ayuntamiento">
        <CargosPanel />
      </Drawer>
      <Drawer open={tab === 'plenos'} onClose={() => setTab('city')} title="⚖ Plenos municipales">
        <PlenosPanel />
      </Drawer>
    </div>
  )
}
