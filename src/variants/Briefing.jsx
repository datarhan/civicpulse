import { useState } from 'react'

const CITIES = [
  { id: 'puertollano', name: 'Puertollano' },
  { id: 'valdepenas',  name: 'Valdepeñas' },
  { id: 'tomelloso',   name: 'Tomelloso' },
]

const PERSONAS = [
  { id: 'citizen',    name: 'Ciudadano' },
  { id: 'journalist', name: 'Periodista' },
  { id: 'watchdog',   name: 'Vigilante' },
]

const KICKER_COLOR = {
  ink:   'var(--cb-ink)',
  red:   'var(--cb-accent)',
  navy:  'var(--cb-accent2)',
  green: 'var(--cb-green)',
  amber: 'var(--cb-amber)',
  gray:  'var(--cb-ink60)',
}

const PILL_TONES = {
  red:   ['#F5E1DE', 'var(--cb-accent)'],
  green: ['#E2EDE3', 'var(--cb-green)'],
  amber: ['#F5E7D4', 'var(--cb-amber)'],
  navy:  ['#DDE3F2', 'var(--cb-accent2)'],
  gray:  ['var(--cb-paper2)', 'var(--cb-ink60)'],
}

function Kicker({ tone = 'ink', children, size = 11 }) {
  return (
    <div
      className="mono"
      style={{
        fontSize: size,
        color: KICKER_COLOR[tone],
        fontWeight: 700,
        letterSpacing: '.12em',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </div>
  )
}

function Rule({ thick = 1, color = 'var(--cb-rule)', style = {} }) {
  return <div style={{ height: thick, background: color, ...style }} />
}

function Byline({ who, role }) {
  return (
    <div className="mono" style={{ fontSize: 11, color: 'var(--cb-ink60)', letterSpacing: '.06em' }}>
      POR <b style={{ color: 'var(--cb-ink)' }}>{who?.toUpperCase()}</b>
      {role && <> · {role}</>}
    </div>
  )
}

function BPill({ tone = 'gray', children }) {
  const [bg, fg] = PILL_TONES[tone] || PILL_TONES.gray
  return (
    <span
      className="mono"
      style={{
        background: bg,
        color: fg,
        fontSize: 10,
        fontWeight: 700,
        padding: '3px 7px',
        borderRadius: 3,
        letterSpacing: '.05em',
      }}
    >
      {children}
    </span>
  )
}

function Masthead({ city, persona, route, onNav, onTogglePersona, onToggleBot }) {
  const today = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const items = [
    { id: 'briefing', label: 'Boletín' },
    { id: 'lentes',   label: 'Lentes' },
    { id: 'recibo',   label: 'Mi recibo' },
    { id: 'cargos',   label: 'Cargos' },
    { id: 'plenos',   label: 'Plenos' },
    { id: 'archivo',  label: 'Archivo' },
    { id: 'datos',    label: 'Datos abiertos' },
  ]
  return (
    <header style={{ background: 'var(--cb-paper)', borderBottom: '2px solid var(--cb-rule)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 28px',
          borderBottom: '1px solid var(--cb-hair)',
          fontSize: 11.5,
          color: 'var(--cb-ink60)',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div className="mono" style={{ letterSpacing: '.08em', textTransform: 'uppercase' }}>
          {today} · {city.name} · Ed. mañana
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <button
            onClick={onToggleBot}
            className="mono"
            style={{ fontSize: 11, letterSpacing: '.06em', color: 'var(--cb-accent2)', fontWeight: 700 }}
          >
            📱 Ver bot de Telegram
          </button>
          <button
            onClick={onTogglePersona}
            className="mono"
            style={{
              fontSize: 11,
              letterSpacing: '.06em',
              color: 'var(--cb-ink60)',
              textDecoration: 'underline',
              textUnderlineOffset: 3,
            }}
          >
            Vista: {PERSONAS.find((p) => p.id === persona).name.toLowerCase()}
          </button>
        </div>
      </div>
      <div style={{ padding: '18px 28px 14px', textAlign: 'center' }}>
        <div
          className="cb-serif"
          style={{
            fontSize: 54,
            fontWeight: 900,
            letterSpacing: '-.025em',
            lineHeight: 1,
          }}
        >
          El Boletín Municipal
        </div>
        <div
          className="mono"
          style={{
            fontSize: 11,
            color: 'var(--cb-accent)',
            marginTop: 8,
            letterSpacing: '.2em',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          Diario cívico · Transparencia · Rendición de cuentas
        </div>
      </div>
      <nav
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 0,
          padding: '0 28px',
          borderTop: '3px double var(--cb-rule)',
          borderBottom: '1px solid var(--cb-rule)',
          flexWrap: 'wrap',
        }}
      >
        {items.map((n) => (
          <button
            key={n.id}
            onClick={() => onNav(n.id)}
            className="mono"
            style={{
              padding: '12px 18px',
              fontSize: 11.5,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              fontWeight: route === n.id ? 700 : 500,
              color: route === n.id ? 'var(--cb-accent)' : 'var(--cb-ink80)',
              borderBottom: route === n.id ? '2px solid var(--cb-accent)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {n.label}
          </button>
        ))}
      </nav>
    </header>
  )
}

function PromiseChart() {
  const weeks = Array.from({ length: 12 }, (_, i) => 72 + Math.sin(i * 0.8) * 10 + (i % 3 === 0 ? -8 : 0))
  const W = 280, H = 130
  const pts = weeks.map((v, i) => [(i / (weeks.length - 1)) * W, H - (v / 100) * H])
  const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H + 20}`} style={{ width: '100%', height: 150 }}>
      {[0, 25, 50, 75, 100].map((y) => (
        <g key={y}>
          <line
            x1="0"
            x2={W}
            y1={H - (y / 100) * H}
            y2={H - (y / 100) * H}
            stroke="var(--cb-hair)"
            strokeDasharray="2,3"
          />
          <text x="0" y={H - (y / 100) * H - 2} fontSize="9" fill="var(--cb-ink40)" fontFamily="DM Mono">
            {y}%
          </text>
        </g>
      ))}
      <line x1="0" x2={W} y1="0" y2="0" stroke="var(--cb-accent)" strokeDasharray="4,3" strokeWidth="1.5" />
      <path d={path + ` L ${W},${H} L 0,${H} Z`} fill="var(--cb-ink)" fillOpacity=".08" />
      <path d={path} stroke="var(--cb-ink)" strokeWidth="2" fill="none" />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r="2.5" fill="var(--cb-ink)" />
      ))}
      {['Ene', 'Feb', 'Mar'].map((m, i) => (
        <text
          key={m}
          x={(i * W) / 3 + 16}
          y={H + 15}
          fontSize="10"
          fill="var(--cb-ink60)"
          fontFamily="DM Mono"
        >
          {m}
        </text>
      ))}
    </svg>
  )
}

function BigStat({ val, label }) {
  return (
    <div>
      <div
        className="cb-serif"
        style={{
          fontSize: 34,
          fontWeight: 800,
          lineHeight: 1,
          color: 'var(--cb-accent)',
          letterSpacing: '-.02em',
        }}
      >
        {val}
      </div>
      <div
        className="mono"
        style={{
          fontSize: 10,
          color: 'var(--cb-ink60)',
          letterSpacing: '.06em',
          textTransform: 'uppercase',
          marginTop: 3,
        }}
      >
        {label}
      </div>
    </div>
  )
}

function LeadStory() {
  return (
    <article
      style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1.2fr',
        gap: 32,
        paddingBottom: 28,
        borderBottom: '1px solid var(--cb-rule)',
      }}
    >
      <div>
        <Kicker tone="red">Promesa incumplida · investigación del Boletín</Kicker>
        <h1
          className="cb-serif"
          style={{
            fontSize: 56,
            fontWeight: 800,
            letterSpacing: '-.025em',
            lineHeight: 1.02,
            margin: '10px 0 14px',
          }}
        >
          El concejal de Limpieza prometió responder en 48&nbsp;horas. No lo hace en 32% de casos.
        </h1>
        <div
          className="cb-serif"
          style={{
            fontSize: 19,
            color: 'var(--cb-ink80)',
            lineHeight: 1.45,
            fontStyle: 'italic',
            marginBottom: 14,
          }}
        >
          Roberto Silva asumió el cargo hace once meses con una promesa medible. Los datos que su propia
          administración publica lo contradicen: en las últimas doce semanas, solo 68% de las incidencias se
          resolvieron en plazo.
        </div>
        <Byline who="Redacción CivicPulse" role="análisis de 312 quejas" />
        <div
          style={{
            marginTop: 18,
            columnCount: 2,
            columnGap: 24,
            columnRule: '1px solid var(--cb-hair)',
            fontSize: 14,
            lineHeight: 1.55,
            textAlign: 'justify',
            hyphens: 'auto',
          }}
        >
          <p style={{ margin: 0 }}>
            <span
              className="cb-serif"
              style={{
                fontSize: 42,
                float: 'left',
                lineHeight: 0.85,
                marginRight: 6,
                fontWeight: 700,
                color: 'var(--cb-accent)',
              }}
            >
              L
            </span>
            a promesa se hizo en campaña y se repitió en el primer pleno: ninguna incidencia ciudadana tardaría
            más de 48 horas en recibir una primera respuesta. El portal municipal lleva once meses publicando
            esos tiempos. Esta redacción los ha cruzado con los registros de asignación.
          </p>
          <p>
            Entre enero y marzo, el departamento de Limpieza recibió 942 quejas. Respondió dentro de plazo a
            640. Las 302 restantes tardaron una media de 73 horas — 1,5 veces el objetivo declarado.
          </p>
          <p>
            La concejalía atribuye el desvío a la temporada de hojas y a tres bajas simultáneas en el turno de
            tarde. Los datos, sin embargo, muestran que el incumplimiento es constante, no estacional: el peor
            trimestre fue el último del año pasado, con 41%.
          </p>
          <p style={{ marginBottom: 0 }}>
            Preguntado por este medio, Silva ha reconocido "un desfase operativo" y ha anunciado un plan de
            refuerzo que, según el propio contrato marco, requiere aprobación en pleno. Esa aprobación no
            figura en el orden del día de la sesión de hoy.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
          <BPill tone="red">Limpieza</BPill>
          <BPill tone="amber">Rendición de cuentas</BPill>
          <BPill>Datos cruzados</BPill>
        </div>
      </div>

      <div>
        <div style={{ background: 'var(--cb-paper2)', padding: '18px 20px', border: '1px solid var(--cb-hair)' }}>
          <Kicker size={10}>La promesa vs los datos</Kicker>
          <div
            className="cb-serif"
            style={{ fontSize: 15, fontWeight: 600, margin: '6px 0 14px', lineHeight: 1.3 }}
          >
            % de quejas respondidas en ≤ 48 h · por semana
          </div>
          <PromiseChart />
          <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 11, color: 'var(--cb-ink60)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 14, height: 2, background: 'var(--cb-ink)' }} /> Real
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 14, height: 0, borderTop: '2px dashed var(--cb-accent)' }} />
              Promesa (100%)
            </span>
          </div>
          <Rule style={{ margin: '16px 0 12px' }} color="var(--cb-hair)" />
          <div style={{ display: 'flex', gap: 16 }}>
            <BigStat val="68%" label="en plazo" />
            <BigStat val="73 h" label="media fuera de plazo" />
          </div>
        </div>
        <div style={{ padding: '14px 0 0', fontSize: 12, color: 'var(--cb-ink60)', fontStyle: 'italic' }}>
          Metodología: cruce de los datasets{' '}
          <span className="mono" style={{ color: 'var(--cb-ink)' }}>incidencias.csv</span> y{' '}
          <span className="mono" style={{ color: 'var(--cb-ink)' }}>asignaciones.csv</span> del portal de datos
          abiertos, enero–marzo 2026.
        </div>
      </div>
    </article>
  )
}

function SmallBars() {
  const vendors = [
    { name: 'Silva SA', lots: 6, pct: 100 },
    { name: 'Asfaltia',  lots: 0, pct: 0 },
    { name: 'Pavimex',   lots: 0, pct: 0 },
    { name: 'RutaSur',   lots: 0, pct: 0 },
  ]
  return (
    <div>
      <div
        className="mono"
        style={{ fontSize: 9.5, color: 'var(--cb-ink60)', letterSpacing: '.06em', marginBottom: 8 }}
      >
        ÚLTIMOS 6 LOTES ADJUDICADOS
      </div>
      {vendors.map((v, i) => (
        <div
          key={i}
          style={{
            display: 'grid',
            gridTemplateColumns: '90px 1fr 30px',
            gap: 8,
            alignItems: 'center',
            marginBottom: 5,
            fontSize: 12,
          }}
        >
          <div style={{ fontWeight: i === 0 ? 700 : 500 }}>{v.name}</div>
          <div style={{ height: 12, background: 'var(--cb-hair)', position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                inset: `0 ${100 - v.pct}% 0 0`,
                background: i === 0 ? 'var(--cb-accent)' : 'var(--cb-ink60)',
              }}
            />
          </div>
          <div className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>
            {v.lots}
          </div>
        </div>
      ))}
    </div>
  )
}

function SmallMap() {
  const greens = [
    [20, 20], [35, 15], [45, 35], [25, 45], [55, 25], [70, 40],
    [85, 20], [80, 55], [15, 55], [55, 55], [65, 15], [90, 40],
  ]
  const missing = [[10, 10], [92, 8], [50, 60]]
  return (
    <div style={{ position: 'relative', aspectRatio: '3/2', background: 'var(--cb-paper)', border: '1px solid var(--cb-hair)' }}>
      <svg viewBox="0 0 100 66" style={{ width: '100%', height: '100%' }}>
        <rect width="100" height="66" fill="var(--cb-paper)" />
        <path d="M0 30 L100 28 M30 0 L32 66 M68 0 L66 66" stroke="var(--cb-hair)" strokeWidth=".5" />
        <path d="M0 50 Q 30 48 60 52 T 100 50" stroke="var(--cb-hair)" strokeWidth=".4" fill="none" />
        {greens.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="1.8" fill="var(--cb-green)" />)}
        {missing.map((p, i) => <circle key={'x' + i} cx={p[0]} cy={p[1]} r="1.8" fill="var(--cb-accent)" opacity=".7" />)}
      </svg>
      <div style={{ position: 'absolute', bottom: 5, right: 6, fontSize: 9 }} className="mono">
        99 / 120
      </div>
    </div>
  )
}

function SmallTimeline() {
  const items = [
    { t: '17:00', text: 'Apertura',                    tone: 'gray' },
    { t: '17:15', text: 'Modif. presupuestaria 3/26',  tone: 'amber' },
    { t: '17:45', text: 'Ordenanza ruidos',            tone: 'red' },
    { t: '18:20', text: 'Moción ZBE',                  tone: 'red' },
    { t: '18:50', text: 'Ruegos',                      tone: 'gray' },
  ]
  return (
    <div style={{ fontSize: 12 }}>
      <div
        className="mono"
        style={{ fontSize: 9.5, color: 'var(--cb-ink60)', letterSpacing: '.06em', marginBottom: 8 }}
      >
        ORDEN DEL DÍA · HOY 18:00
      </div>
      {items.map((it, i) => (
        <div
          key={i}
          style={{
            display: 'grid',
            gridTemplateColumns: '46px 1fr',
            gap: 8,
            marginBottom: 4,
            alignItems: 'baseline',
          }}
        >
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--cb-ink60)' }}>{it.t}</span>
          <span style={{ fontWeight: it.tone === 'red' || it.tone === 'amber' ? 600 : 500 }}>
            {it.text} {it.tone === 'red' && <BPill tone="red">caliente</BPill>}
          </span>
        </div>
      ))}
    </div>
  )
}

function Secondary() {
  const stories = [
    {
      kicker: 'Presupuesto',
      kTone: 'navy',
      head: 'Los €1.24M del asfaltado y el único adjudicatario que siempre gana',
      dek: 'Cuatro licitadores presentaron oferta al contrato marco de pavimentación. Uno ha ganado todos los últimos seis lotes.',
      byline: 'M. Torres',
      viz: 'bars',
    },
    {
      kicker: 'Medio Ambiente',
      kTone: 'green',
      head: 'Los puntos de reciclaje que prometieron: 83% instalados',
      dek: 'El departamento de Javier Moreno ha cumplido el calendario. De 120 puntos previstos, 99 ya funcionan. Mapa de cobertura.',
      byline: 'Redacción',
      viz: 'map',
    },
    {
      kicker: 'Pleno de hoy',
      kTone: 'red',
      head: 'Dos puntos calientes y una moción que divide al equipo de gobierno',
      dek: 'La ordenanza de ruidos y la Zona de Bajas Emisiones se debaten hoy a las 18:00. El equipo de gobierno no ha cerrado postura.',
      byline: 'Á. Núñez',
      viz: 'timeline',
    },
  ]
  return (
    <section style={{ paddingTop: 24, paddingBottom: 28, borderBottom: '1px solid var(--cb-rule)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 28 }}>
        {stories.map((s, i) => (
          <article
            key={i}
            style={{
              paddingRight: i < 2 ? 28 : 0,
              borderRight: i < 2 ? '1px solid var(--cb-hair)' : 'none',
            }}
          >
            <Kicker tone={s.kTone} size={10}>
              {s.kicker}
            </Kicker>
            <h2
              className="cb-serif"
              style={{
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: '-.015em',
                lineHeight: 1.15,
                margin: '8px 0 10px',
              }}
            >
              {s.head}
            </h2>
            <div style={{ fontSize: 13.5, color: 'var(--cb-ink80)', lineHeight: 1.5, marginBottom: 12 }}>
              {s.dek}
            </div>
            <Byline who={s.byline} />
            <div
              style={{
                marginTop: 14,
                background: 'var(--cb-paper2)',
                padding: '12px 14px',
                border: '1px solid var(--cb-hair)',
              }}
            >
              {s.viz === 'bars' && <SmallBars />}
              {s.viz === 'map' && <SmallMap />}
              {s.viz === 'timeline' && <SmallTimeline />}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function Standings() {
  const rows = [
    { d: 'Seguridad',       l: 'Elena Castro',  s: 85, w: +2, note: 'nada nuevo' },
    { d: 'Tomelloso avg',   l: 'Ciudad vecina', s: 82, w: +1, note: 'referencia' },
    { d: 'Obras',           l: 'Carmen Ruiz',   s: 81, w: +3, note: 'alumbrado adjudicado' },
    { d: 'Serv. Sociales',  l: 'Marta Jiménez', s: 79, w: +5, note: 'subida más fuerte' },
    { d: 'Cultura',         l: 'Pablo Herrera', s: 77, w:  0, note: 'estable' },
    { d: 'Medio Amb.',      l: 'Javier Moreno', s: 72, w: +1, note: 'cumpliendo plan' },
    { d: 'Puertollano avg', l: 'Ciudad',        s: 71, w: +2, note: 'media' },
    { d: 'Limpieza',        l: 'Roberto Silva', s: 64, w: -4, note: 'ver portada' },
  ]
  return (
    <section style={{ paddingTop: 24, paddingBottom: 28, borderBottom: '1px solid var(--cb-rule)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <Kicker tone="navy">Rendición semanal</Kicker>
          <h2 className="cb-serif" style={{ fontSize: 30, fontWeight: 800, margin: '6px 0 0', letterSpacing: '-.02em' }}>
            Cómo va cada departamento
          </h2>
        </div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--cb-ink60)' }}>
          cerrado viernes · score 0–100 · Δ semana
        </div>
      </div>
      <div style={{ border: '1px solid var(--cb-rule)', background: 'var(--cb-paper)' }}>
        <div
          className="mono"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1.2fr 70px 60px 140px',
            padding: '10px 16px',
            fontSize: 10.5,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            color: 'var(--cb-ink60)',
            background: 'var(--cb-paper2)',
            borderBottom: '1px solid var(--cb-rule)',
          }}
        >
          <div>Departamento</div>
          <div>Titular</div>
          <div style={{ textAlign: 'right' }}>Score</div>
          <div style={{ textAlign: 'right' }}>Δ</div>
          <div>Nota</div>
        </div>
        {rows.map((r, i) => (
          <div
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1.2fr 70px 60px 140px',
              padding: '11px 16px',
              borderBottom: i === rows.length - 1 ? 'none' : '1px solid var(--cb-hair)',
              alignItems: 'center',
              fontSize: 13,
              background: r.d.includes('avg') ? 'var(--cb-paper2)' : 'transparent',
              fontStyle: r.d.includes('avg') ? 'italic' : 'normal',
            }}
          >
            <div style={{ fontWeight: 600 }}>{r.d}</div>
            <div style={{ color: 'var(--cb-ink60)' }}>{r.l}</div>
            <div
              className="mono"
              style={{
                textAlign: 'right',
                fontSize: 15,
                fontWeight: 700,
                color: r.s >= 80 ? 'var(--cb-green)' : r.s >= 70 ? 'var(--cb-ink)' : 'var(--cb-accent)',
              }}
            >
              {r.s}
            </div>
            <div
              className="mono"
              style={{
                textAlign: 'right',
                fontSize: 12,
                color: r.w > 0 ? 'var(--cb-green)' : r.w < 0 ? 'var(--cb-accent)' : 'var(--cb-ink40)',
              }}
            >
              {r.w > 0 ? '+' : ''}
              {r.w}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--cb-ink60)', fontStyle: 'italic' }}>{r.note}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

function Streamgraph() {
  const W = 520, H = 180, N = 8
  const partidas = [
    { c: '#1E3A8A', base: [0, 0, 0, 0, 0, 0, 0, 0],                 v: [28, 26, 30, 35, 38, 40, 38, 38] },
    { c: '#B0291F', base: [28, 26, 30, 35, 38, 40, 38, 38],         v: [18, 20, 22, 20, 18, 20, 22, 22] },
    { c: '#3F6B44', base: [46, 46, 52, 55, 56, 60, 60, 60],         v: [14, 15, 13, 15, 15, 14, 15, 15] },
    { c: '#B45309', base: [60, 61, 65, 70, 71, 74, 75, 75],         v: [12, 11, 13, 10, 9, 8, 10, 10]   },
    { c: '#6B5B4A', base: [72, 72, 78, 80, 80, 82, 85, 85],         v: [7, 6, 7, 6, 8, 7, 7, 7]         },
    { c: '#94948A', base: [79, 78, 85, 86, 88, 89, 92, 92],         v: [8, 9, 8, 7, 7, 8, 6, 8]         },
  ]
  const total = 100
  const path = (base, v) => {
    const top = base.map((b, i) => [(i / (N - 1)) * W, H - ((b + v[i]) / total) * H])
    const bot = base.map((b, i) => [(i / (N - 1)) * W, H - (b / total) * H]).reverse()
    return (
      [...top, ...bot].map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ') +
      ' Z'
    )
  }
  return (
    <div style={{ background: 'var(--cb-paper2)', padding: 14, border: '1px solid var(--cb-hair)' }}>
      <svg viewBox={`0 0 ${W} ${H + 22}`} style={{ width: '100%', height: 200 }}>
        {partidas.map((p, i) => <path key={i} d={path(p.base, p.v)} fill={p.c} opacity=".82" />)}
        {['T1 23', 'T2', 'T3', 'T4', 'T1 24', 'T2', 'T3', 'T4 24'].map((l, i) => (
          <text
            key={l}
            x={(i / (N - 1)) * W}
            y={H + 15}
            fontSize="9"
            fill="var(--cb-ink60)"
            fontFamily="DM Mono"
            textAnchor={i === 0 ? 'start' : i === N - 1 ? 'end' : 'middle'}
          >
            {l}
          </text>
        ))}
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8, fontSize: 10.5 }}>
        {['Personal', 'Obras', 'Servicios', 'Deuda', 'Cultura', 'Otros'].map((l, i) => (
          <span
            key={l}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--cb-ink60)' }}
          >
            <span style={{ width: 10, height: 10, background: partidas[i].c }} />
            {l}
          </span>
        ))}
      </div>
    </div>
  )
}

function Receipt() {
  const tax = [
    { cat: 'Personal municipal',    pct: 38, eur: 185 },
    { cat: 'Obras e infraestruct.', pct: 22, eur: 107 },
    { cat: 'Servicios básicos',     pct: 15, eur:  73 },
    { cat: 'Deuda + financiación',  pct: 10, eur:  49 },
    { cat: 'Cultura y deportes',    pct:  7, eur:  34 },
    { cat: 'Otros',                 pct:  8, eur:  39 },
  ]
  return (
    <section
      style={{
        paddingTop: 24,
        paddingBottom: 28,
        borderBottom: '1px solid var(--cb-rule)',
        display: 'grid',
        gridTemplateColumns: '1.1fr 1fr',
        gap: 28,
      }}
    >
      <div>
        <Kicker tone="amber">Tu recibo del IBI</Kicker>
        <h2
          className="cb-serif"
          style={{
            fontSize: 36,
            fontWeight: 800,
            margin: '8px 0 8px',
            letterSpacing: '-.02em',
            lineHeight: 1.05,
          }}
        >
          Pagaste <span style={{ color: 'var(--cb-accent)' }}>€487</span>. Así los gasta el Ayuntamiento.
        </h2>
        <div style={{ fontSize: 14, color: 'var(--cb-ink80)', marginBottom: 14, lineHeight: 1.55 }}>
          Este cálculo aplica tu IBI base al porcentaje ejecutado del presupuesto 2026. Cada partida enlaza con
          los contratos, las plantillas y las actas donde se aprobó.
        </div>
        <div
          style={{
            background: 'var(--cb-paper2)',
            padding: '18px 20px',
            border: '1px solid var(--cb-hair)',
            fontFamily: 'DM Mono',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 60px 70px',
              padding: '6px 0',
              borderBottom: '1px dashed var(--cb-ink)',
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '.08em',
              color: 'var(--cb-ink60)',
              fontWeight: 700,
            }}
          >
            <div>PARTIDA</div>
            <div style={{ textAlign: 'right' }}>%</div>
            <div style={{ textAlign: 'right' }}>EUROS</div>
          </div>
          {tax.map((t, i) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 60px 70px',
                padding: '8px 0',
                borderBottom: i === tax.length - 1 ? '1px solid var(--cb-ink)' : '1px dotted var(--cb-hair)',
                fontSize: 13,
              }}
            >
              <div style={{ color: 'var(--cb-ink)', fontFamily: 'Inter' }}>{t.cat}</div>
              <div style={{ textAlign: 'right', color: 'var(--cb-ink60)' }}>{t.pct}%</div>
              <div style={{ textAlign: 'right', fontWeight: 700 }}>€{t.eur}</div>
            </div>
          ))}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 60px 70px',
              padding: '10px 0 2px',
              fontSize: 14,
              fontWeight: 800,
            }}
          >
            <div style={{ fontFamily: 'Inter' }}>TOTAL</div>
            <div style={{ textAlign: 'right' }}>100%</div>
            <div style={{ textAlign: 'right', color: 'var(--cb-accent)' }}>€487</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Kicker>A dónde va cada euro</Kicker>
        <Streamgraph />
        <div style={{ fontSize: 12, color: 'var(--cb-ink60)', fontStyle: 'italic' }}>
          Cada banda representa la evolución trimestral del gasto por partida. Más ancho = más gasto del
          trimestre. Los picos del T1 2023 (deuda) y del T3 2024 (personal) son debates abiertos.
        </div>
      </div>
    </section>
  )
}

function MiniSpark({ data, color }) {
  const max = Math.max(...data)
  const min = Math.min(...data)
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * 100,
    36 - ((v - min) / (max - min || 1)) * 30 - 3,
  ])
  const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')
  return (
    <svg viewBox="0 0 100 36" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
      <path d={path} stroke={color} strokeWidth="1.25" fill="none" vectorEffect="non-scaling-stroke" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2" fill={color} />
    </svg>
  )
}

function SmallMultiples() {
  const metrics = [
    { name: 'Quejas nuevas',   unit: '/día',      latest: 57,  trend: 'up-bad',    data: [45, 48, 52, 50, 49, 55, 57, 61, 58, 57]         },
    { name: 'Resolución',      unit: 'horas',     latest: 41,  trend: 'down-good', data: [54, 52, 50, 48, 46, 44, 43, 42, 41, 41]         },
    { name: 'Promesas',        unit: '% cumpl.',  latest: 71,  trend: 'up-good',   data: [62, 64, 66, 65, 67, 68, 70, 69, 71, 71]         },
    { name: '€ ejecutado',     unit: 'M mes',     latest: 3.9, trend: 'up-good',   data: [3.1, 3.2, 3.4, 3.5, 3.6, 3.7, 3.8, 3.8, 3.9, 3.9] },
    { name: 'Plantilla',       unit: 'plazas',    latest: 618, trend: 'flat',      data: [615, 616, 616, 617, 617, 618, 618, 618, 618, 618] },
    { name: 'Asistencia pleno',unit: '%',         latest: 92,  trend: 'up-good',   data: [85, 86, 88, 88, 90, 90, 91, 92, 92, 92]         },
  ]
  const color = (t) =>
    t === 'up-bad' ? 'var(--cb-accent)' : t === 'down-good' || t === 'up-good' ? 'var(--cb-green)' : 'var(--cb-ink60)'
  return (
    <section style={{ paddingTop: 24, paddingBottom: 28, borderBottom: '1px solid var(--cb-rule)' }}>
      <Kicker tone="navy">Pulso</Kicker>
      <h2
        className="cb-serif"
        style={{ fontSize: 30, fontWeight: 800, margin: '6px 0 16px', letterSpacing: '-.02em' }}
      >
        Seis indicadores que miramos cada mañana
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
        {metrics.map((m, i) => (
          <div key={i} style={{ paddingBottom: 12, borderBottom: '1px solid var(--cb-hair)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div className="cb-serif" style={{ fontSize: 15, fontWeight: 700 }}>
                {m.name}
              </div>
              <div className="mono" style={{ fontSize: 10.5, color: 'var(--cb-ink60)', letterSpacing: '.06em' }}>
                {m.unit}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginTop: 6 }}>
              <div
                className="cb-serif"
                style={{
                  fontSize: 32,
                  fontWeight: 800,
                  lineHeight: 1,
                  color: color(m.trend),
                }}
              >
                {m.latest}
              </div>
              <div style={{ flex: 1, height: 36 }}>
                <MiniSpark data={m.data} color={color(m.trend)} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function Tomorrow() {
  const events = [
    { h: '09:00', t: 'Publicación de contratos 1T',        dek: 'El portal de transparencia actualiza adjudicaciones. Esperamos ver los 12 lotes pendientes.' },
    { h: '11:30', t: 'Consejo de Barrio Zona Sur',          dek: 'Primera sesión tras el cambio del plan de asfaltado. Acta pública.' },
    { h: '17:00', t: 'Apertura plazo alegaciones PGOU',     dek: '30 días. Puntos de interés: expansión Norte y protección del Pozo.' },
  ]
  const promises = [
    { t: 'Reducir tiempo respuesta quejas <48 h',    owner: 'R. Silva',    due: 'viernes', pct: 41, tone: 'red'   },
    { t: 'Plan de eficiencia energética edificios',  owner: 'C. Ruiz',     due: 'viernes', pct: 28, tone: 'red'   },
    { t: 'Programa jóvenes emprendedores',           owner: 'P. Herrera',  due: 'domingo', pct: 55, tone: 'amber' },
  ]
  return (
    <section
      style={{
        paddingTop: 24,
        paddingBottom: 28,
        borderBottom: '1px solid var(--cb-rule)',
        display: 'grid',
        gridTemplateColumns: '1fr 1.2fr',
        gap: 28,
      }}
    >
      <div>
        <Kicker tone="red">Mañana</Kicker>
        <h2
          className="cb-serif"
          style={{ fontSize: 30, fontWeight: 800, margin: '6px 0 10px', letterSpacing: '-.02em' }}
        >
          Lo que hay que vigilar
        </h2>
        <div style={{ fontSize: 14, color: 'var(--cb-ink80)', lineHeight: 1.55, marginBottom: 14 }}>
          Tres hechos están ya programados y todos requieren atención ciudadana. Este Boletín volverá sobre
          ellos en su próxima edición.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {events.map((e, i) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '54px 1fr',
                gap: 14,
                paddingBottom: 12,
                borderBottom: i === 2 ? 'none' : '1px solid var(--cb-hair)',
              }}
            >
              <div
                className="mono"
                style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--cb-accent)', letterSpacing: '.06em' }}
              >
                {e.h}
              </div>
              <div>
                <div className="cb-serif" style={{ fontSize: 16, fontWeight: 700 }}>
                  {e.t}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--cb-ink60)', marginTop: 2, lineHeight: 1.5 }}>
                  {e.dek}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <Kicker>Promesas en el radar</Kicker>
        <h3
          className="cb-serif"
          style={{ fontSize: 22, fontWeight: 700, margin: '6px 0 14px', letterSpacing: '-.015em' }}
        >
          Vencen esta semana · 3 fichas
        </h3>
        {promises.map((p, i) => (
          <div key={i} style={{ padding: '14px 0', borderBottom: i === 2 ? 'none' : '1px solid var(--cb-hair)' }}>
            <div
              className="cb-serif"
              style={{
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: '-.005em',
                marginBottom: 4,
              }}
            >
              {p.t}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--cb-ink60)' }}>
              <span>{p.owner}</span>·<span>vence {p.due}</span>
              <span style={{ flex: 1 }} />
              <span
                className="mono"
                style={{
                  color: p.tone === 'red' ? 'var(--cb-accent)' : 'var(--cb-amber)',
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                {p.pct}%
              </span>
            </div>
            <div style={{ height: 3, background: 'var(--cb-paper2)', marginTop: 7, overflow: 'hidden' }}>
              <div
                style={{
                  width: p.pct + '%',
                  height: '100%',
                  background: p.tone === 'red' ? 'var(--cb-accent)' : 'var(--cb-amber)',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function BriefingFooter() {
  return (
    <footer style={{ padding: '36px 0 48px', borderTop: '3px double var(--cb-rule)' }}>
      <div style={{ textAlign: 'center', marginBottom: 14 }}>
        <div className="cb-serif" style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.02em' }}>
          El Boletín Municipal
        </div>
        <div
          className="mono"
          style={{
            fontSize: 10.5,
            color: 'var(--cb-ink60)',
            letterSpacing: '.2em',
            marginTop: 4,
            textTransform: 'uppercase',
          }}
        >
          CivicPulse · Edición Puertollano · Nº 287
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4,1fr)',
          gap: 24,
          fontSize: 12,
          color: 'var(--cb-ink60)',
          maxWidth: 760,
          margin: '24px auto 0',
          textAlign: 'center',
        }}
      >
        <div>
          <div style={{ fontWeight: 700, color: 'var(--cb-ink)', marginBottom: 6 }}>Boletín</div>
          Portada · Lentes · Archivo
        </div>
        <div>
          <div style={{ fontWeight: 700, color: 'var(--cb-ink)', marginBottom: 6 }}>Datos</div>
          Portal abierto · API · CSV
        </div>
        <div>
          <div style={{ fontWeight: 700, color: 'var(--cb-ink)', marginBottom: 6 }}>Bot</div>
          Telegram · WhatsApp · Email
        </div>
        <div>
          <div style={{ fontWeight: 700, color: 'var(--cb-ink)', marginBottom: 6 }}>Participa</div>
          Reportar · Alegaciones · Código
        </div>
      </div>
    </footer>
  )
}

function DateChip({ children }) {
  return (
    <div
      style={{
        alignSelf: 'center',
        padding: '3px 10px',
        background: 'rgba(91,141,239,.2)',
        color: 'white',
        borderRadius: 11,
        fontSize: 10.5,
        fontWeight: 600,
        margin: '4px 0',
      }}
    >
      {children}
    </div>
  )
}

function BotMsg({ time, children }) {
  return (
    <div
      style={{
        alignSelf: 'flex-start',
        maxWidth: '86%',
        background: '#182533',
        borderRadius: '12px 12px 12px 4px',
        padding: '10px 12px 8px',
        color: 'white',
      }}
    >
      {children}
      <div style={{ fontSize: 10, color: '#7C8693', marginTop: 6, textAlign: 'right' }}>{time}</div>
    </div>
  )
}

function BotButtons({ buttons }) {
  return (
    <div
      style={{
        alignSelf: 'flex-start',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 5,
        maxWidth: '86%',
        marginTop: -4,
      }}
    >
      {buttons.map((b, i) => (
        <button
          key={i}
          style={{
            background: 'rgba(82,136,193,.2)',
            color: '#5B8DEF',
            border: '1px solid rgba(82,136,193,.3)',
            padding: '7px 10px',
            borderRadius: 8,
            fontSize: 12.5,
            fontWeight: 500,
          }}
        >
          {b}
        </button>
      ))}
    </div>
  )
}

function UserMsg({ time, children }) {
  return (
    <div
      style={{
        alignSelf: 'flex-end',
        maxWidth: '80%',
        background: '#2B5278',
        borderRadius: '12px 12px 4px 12px',
        padding: '8px 12px 6px',
        color: 'white',
      }}
    >
      <div style={{ fontSize: 13.5 }}>{children}</div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,.6)', marginTop: 3, textAlign: 'right' }}>
        {time} ✓✓
      </div>
    </div>
  )
}

function TelegramBot({ onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(17,17,17,.7)',
        zIndex: 60,
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 380,
          maxWidth: 'calc(100vw - 24px)',
          background: '#0E1621',
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: '0 30px 80px rgba(0,0,0,.5)',
          fontFamily: 'Inter, system-ui, sans-serif',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: '14px 16px',
            background: '#17212B',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            borderBottom: '1px solid #222E3C',
          }}
        >
          <button onClick={onClose} style={{ color: '#5288C1', fontSize: 22, width: 24 }}>
            ‹
          </button>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #3390EC, #5B8DEF)',
              display: 'grid',
              placeItems: 'center',
              fontSize: 17,
              fontWeight: 700,
            }}
          >
            CP
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>CivicPulse bot</div>
            <div style={{ fontSize: 11.5, color: '#7C8693' }}>bot · en línea</div>
          </div>
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            stroke="#7C8693"
            strokeWidth="1.5"
          >
            <circle cx="10" cy="10" r="7.5" />
            <path d="m6 10 3 3 5-5" />
          </svg>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '14px 10px',
            background: '#0E1621',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <DateChip>HOY</DateChip>
          <BotMsg time="08:00">
            <div
              style={{
                fontSize: 11.5,
                color: '#5B8DEF',
                fontWeight: 700,
                letterSpacing: '.04em',
                marginBottom: 4,
              }}
            >
              📰 BOLETÍN MATUTINO · 19 MAR
            </div>
            <div style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.3, marginBottom: 10 }}>
              Salud de tu ciudad: <span style={{ color: '#64D99B' }}>78 ▲ 2.3</span>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: '#E4E6EB', whiteSpace: 'pre-line' }}>
              <b style={{ color: '#F5B544' }}>• Portada:</b> el concejal de Limpieza incumple su promesa de 48 h
              en 32% de los casos.{'\n\n'}
              <b style={{ color: '#F5B544' }}>• Pleno hoy 18:00:</b> 2 puntos calientes — Ordenanza ruidos,
              Moción ZBE.{'\n\n'}
              <b style={{ color: '#F5B544' }}>• Tu dinero:</b> los €1.24M del asfaltado van siempre al mismo
              adjudicatario.
            </div>
          </BotMsg>
          <BotButtons buttons={['📄 Leer portada', '📊 Mis datos', '🔔 Alertas']} />
          <UserMsg time="08:12">Mis datos</UserMsg>
          <BotMsg time="08:12">
            <div style={{ fontSize: 13, lineHeight: 1.5, color: '#E4E6EB', whiteSpace: 'pre-line' }}>
              <b style={{ color: '#F5B544' }}>Tu recibo del IBI</b> (€487 en 2026):{'\n\n'}
              🟦 €185 — Personal municipal{'\n'}
              🟪 €107 — Obras{'\n'}
              🟩 €73 — Servicios básicos{'\n'}
              🟧 €49 — Deuda{'\n'}
              🟨 €34 — Cultura{'\n'}
              ⬜ €39 — Otros
            </div>
          </BotMsg>
          <BotButtons buttons={['🔍 Desglose completo', '📈 Gráfica', '◂ Atrás']} />
          <UserMsg time="08:13">Avísame de cualquier queja en mi calle</UserMsg>
          <BotMsg time="08:13">
            <div style={{ fontSize: 13.5, color: '#64D99B', fontWeight: 600, marginBottom: 4 }}>
              ✓ Alerta activada
            </div>
            <div style={{ fontSize: 12.5, color: '#E4E6EB', lineHeight: 1.5 }}>
              Te avisaré cuando alguien abra una queja en un radio de 200 m de C/ Mayor 34.
            </div>
          </BotMsg>
        </div>

        <div
          style={{
            padding: '10px 12px',
            background: '#17212B',
            borderTop: '1px solid #222E3C',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#7C8693"
            strokeWidth="1.5"
          >
            <path d="M12 17V7M8 11l4-4 4 4M5 20h14" />
          </svg>
          <div style={{ flex: 1, color: '#7C8693', fontSize: 14 }}>Mensaje</div>
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#5288C1"
            strokeWidth="1.8"
          >
            <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </div>
      </div>
    </div>
  )
}

export default function Briefing() {
  const [route, setRoute] = useState('briefing')
  const [bot, setBot] = useState(false)
  const [persona, setPersona] = useState('citizen')
  const [cityId] = useState('puertollano')

  const city = CITIES.find((c) => c.id === cityId) || CITIES[0]

  const togglePersona = () => {
    const ids = PERSONAS.map((p) => p.id)
    setPersona((prev) => ids[(ids.indexOf(prev) + 1) % ids.length])
  }

  return (
    <div
      data-screen-label="C · Civic Briefing"
      className="briefing-root"
      style={{
        background: 'var(--cb-paper)',
        minHeight: '100vh',
        color: 'var(--cb-ink)',
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      <Masthead
        city={city}
        persona={persona}
        route={route}
        onNav={setRoute}
        onTogglePersona={togglePersona}
        onToggleBot={() => setBot(true)}
      />

      <main style={{ maxWidth: 1120, margin: '0 auto', padding: '24px 28px 0' }}>
        <LeadStory />
        <Secondary />
        <Standings />
        <Receipt />
        <SmallMultiples />
        <Tomorrow />
        <BriefingFooter />
      </main>

      {bot && <TelegramBot onClose={() => setBot(false)} />}
    </div>
  )
}
