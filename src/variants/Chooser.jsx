import { Link } from 'react-router-dom'

function ThumbA() {
  return (
    <div
      style={{
        background: '#F9FAFB',
        display: 'grid',
        gridTemplateColumns: '64px 1fr',
        height: '100%',
        minHeight: 220,
      }}
    >
      <div style={{ background: '#0B0F19' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              margin: '12px auto',
              background: i === 0 ? '#2463EB' : 'rgba(255,255,255,.10)',
            }}
          />
        ))}
      </div>
      <div
        style={{
          padding: 14,
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: 10,
          alignContent: 'start',
        }}
      >
        <div
          style={{
            gridColumn: '1 / -1',
            background: 'white',
            border: '1px solid #F3F4F6',
            borderRadius: 10,
            padding: 10,
            display: 'flex',
            alignItems: 'baseline',
            gap: 10,
          }}
        >
          <span style={{ fontFamily: 'DM Mono', fontWeight: 700, fontSize: 32, color: '#16A34A' }}>78</span>
          <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#16A34A' }}>▲ 2.3</span>
        </div>
        {[
          ['Quejas', 40],
          ['Promesas', 55],
          ['Gasto', 70],
          ['Depts', 30],
        ].map(([label, h]) => (
          <div
            key={label}
            style={{
              background: 'white',
              border: '1px solid #F3F4F6',
              borderRadius: 10,
              height: 72,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 8,
                left: 10,
                fontSize: 9,
                color: 'rgba(11,15,25,.50)',
                textTransform: 'uppercase',
                letterSpacing: '.05em',
              }}
            >
              {label}
            </div>
            <div
              style={{
                position: 'absolute',
                inset: 'auto 0 0 0',
                height: h + '%',
                background: 'linear-gradient(to top, rgba(36,99,235,.25), transparent)',
                borderTop: '2px solid #2463EB',
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function ThumbB() {
  return (
    <div
      style={{
        background: 'linear-gradient(180deg, #DDE7D0 0%, #C8D5B8 100%)',
        position: 'relative',
        height: '100%',
        minHeight: 220,
      }}
    >
      <div style={{ position: 'absolute', top: 10, left: 10, right: 10, display: 'flex', gap: 6 }}>
        {[
          ['Salud', '78'],
          ['Quejas', '142'],
          ['€ / día', '47k'],
          ['Promesas', '71%'],
        ].map(([l, v]) => (
          <div
            key={l}
            style={{
              flex: 1,
              background: 'rgba(11,15,25,.82)',
              color: 'white',
              borderRadius: 8,
              padding: '6px 8px',
              fontFamily: 'DM Mono',
              fontWeight: 700,
              fontSize: 13,
              textAlign: 'center',
              border: '1px solid rgba(255,255,255,.08)',
            }}
          >
            <div
              style={{
                fontSize: 7,
                fontWeight: 500,
                opacity: 0.65,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
                marginBottom: 2,
              }}
            >
              {l}
            </div>
            {v}
          </div>
        ))}
      </div>
      <div
        style={{
          position: 'absolute',
          inset: '60px 0 36px',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          gap: 0,
        }}
      >
        {[32, 52, 28, 64, 40, 72, 48, 36, 58, 44, 68, 30].map((h, i) => (
          <div
            key={i}
            style={{
              width: 14,
              background: i === 5 ? '#D4CFB8' : '#E5DDC8',
              border: '1px solid rgba(11,15,25,.15)',
              borderBottom: 0,
              height: h,
            }}
          />
        ))}
      </div>
      {[
        ['#DC2626', 96, 40],
        ['#D97706', 110, 120],
        ['#16A34A', 100, 200],
      ].map(([bg, top, left], i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: 8,
            height: 8,
            borderRadius: '50%',
            border: '1.5px solid white',
            boxShadow: '0 1px 3px rgba(0,0,0,.3)',
            background: bg,
            top: `${(top / 220) * 100}%`,
            left: `${(left / 300) * 100}%`,
          }}
        />
      ))}
      <div style={{ position: 'absolute', left: 10, right: 10, bottom: 10, display: 'flex', gap: 4 }}>
        {['Ciudad', 'Quejas', 'Presup.', 'Cargos'].map((t, i) => (
          <div
            key={t}
            style={{
              flex: 1,
              background: i === 0 ? '#2463EB' : 'rgba(255,255,255,.88)',
              color: i === 0 ? 'white' : '#0B0F19',
              backdropFilter: 'blur(10px)',
              borderRadius: 6,
              padding: '4px 6px',
              fontSize: 9,
              fontWeight: 500,
              textAlign: 'center',
            }}
          >
            {t}
          </div>
        ))}
      </div>
    </div>
  )
}

function ThumbC() {
  return (
    <div
      style={{
        background: '#FBFAF5',
        padding: 14,
        display: 'grid',
        gridTemplateColumns: '1fr 120px',
        gap: 10,
        gridTemplateRows: 'auto auto',
        height: '100%',
        minHeight: 220,
      }}
    >
      <div
        style={{
          gridColumn: '1/-1',
          borderBottom: '2px solid #0B0F19',
          paddingBottom: 6,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <span style={{ fontFamily: 'DM Mono', fontWeight: 700, fontSize: 11, letterSpacing: '.15em' }}>
          EL BOLETÍN MUNICIPAL
        </span>
        <span style={{ fontSize: 9, color: 'rgba(11,15,25,.50)' }}>19 MAR</span>
      </div>
      <div>
        <div
          style={{
            fontFamily: 'DM Mono',
            fontSize: 8,
            color: '#DC2626',
            textTransform: 'uppercase',
            letterSpacing: '.1em',
            marginBottom: 3,
          }}
        >
          PROMESA INCUMPLIDA
        </div>
        <div
          className="cb-serif"
          style={{
            fontFamily: 'Fraunces, Georgia, serif',
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: '-.01em',
            lineHeight: 1.25,
          }}
        >
          Concejal de limpieza no cumple plazo de 48h en 32% de quejas
        </div>
        <div
          style={{
            fontSize: 9.5,
            color: 'rgba(11,15,25,.60)',
            marginTop: 4,
            lineHeight: 1.4,
          }}
        >
          Roberto Silva prometió tiempo de respuesta menor a 48 h. Los datos del último trimestre lo contradicen.
        </div>
      </div>
      <div
        style={{
          fontSize: 9,
          color: 'rgba(11,15,25,.60)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          borderLeft: '1px solid #F3F4F6',
          paddingLeft: 8,
        }}
      >
        <div
          style={{
            fontFamily: 'DM Mono',
            fontSize: 8,
            textTransform: 'uppercase',
            letterSpacing: '.1em',
            color: 'rgba(11,15,25,.40)',
          }}
        >
          HOY
        </div>
        <div>
          Salud <b style={{ color: '#16A34A' }}>78 ▲</b>
        </div>
        <div>
          Quejas nuevas <b>+14</b>
        </div>
        <div>Pleno mañana</div>
      </div>
      <div
        style={{
          gridColumn: '1/-1',
          background: 'white',
          border: '1px solid #F3F4F6',
          padding: 8,
          borderRadius: 4,
          height: 54,
          position: 'relative',
        }}
      >
        <svg viewBox="0 0 240 40" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
          <polyline
            points="0,28 20,24 40,26 60,22 80,18 100,16 120,20 140,14 160,12 180,8 200,14 220,10 240,6"
            fill="none"
            stroke="#0B0F19"
            strokeWidth="1.5"
          />
          <polyline
            points="0,36 20,32 40,30 60,30 80,26 100,22 120,22 140,18 160,16 180,14 200,18 220,14 240,12"
            fill="none"
            stroke="#DC2626"
            strokeWidth="1"
            strokeDasharray="2,2"
          />
        </svg>
      </div>
    </div>
  )
}

function ThumbD() {
  return (
    <div
      style={{
        height: '100%',
        minHeight: 220,
        background: '#FAF8F2',
        display: 'grid',
        gridTemplateColumns: '22px 1.4fr 1fr',
        gridTemplateRows: 'auto 1fr 28px',
        fontSize: 9,
        color: 'rgba(11,15,25,.60)',
      }}
    >
      <div
        style={{
          gridColumn: '1 / -1',
          borderBottom: '1px solid #DCD7C8',
          background: 'white',
          padding: '4px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: 'DM Mono',
          fontSize: 8,
          letterSpacing: '.08em',
          textTransform: 'uppercase',
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 2,
            background: '#2463EB',
          }}
        />
        <span>Comunitat Valenciana › Riba-roja</span>
        <span
          style={{
            marginLeft: 'auto',
            background: '#B0291F',
            color: 'white',
            padding: '1px 4px',
            borderRadius: 2,
            fontSize: 7,
          }}
        >
          MVP
        </span>
      </div>

      {/* left rail */}
      <div
        style={{
          background: 'white',
          borderRight: '1px solid #DCD7C8',
          padding: '6px 4px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          alignItems: 'center',
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 2,
            background: '#EEF4FF',
            border: '1px solid #2463EB',
          }}
        />
        {Array.from({ length: 4 }).map((_, i) => (
          <span
            key={i}
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: '#EEF0F3',
            }}
          />
        ))}
      </div>

      {/* map */}
      <div
        style={{
          background: '#0B0F19',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <svg viewBox="0 0 100 60" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <rect width="100" height="60" fill="#0B0F19" />
          <path d="M0 20 L100 22 M0 40 L100 38 M20 0 L18 60 M55 0 L52 60 M78 0 L80 60" stroke="#1A2138" strokeWidth=".6" />
          <path d="M0 30 Q 30 28 55 32 T 100 30" stroke="#232B44" strokeWidth=".8" fill="none" />
        </svg>
        {[
          ['#DC2626', 30, 35],
          ['#D97706', 50, 48],
          ['#60A5FA', 70, 25],
          ['#16A34A', 45, 22],
          ['#D97706', 60, 50],
        ].map(([bg, x, y], i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: bg,
              border: '1.5px solid white',
              left: x + '%',
              top: y + '%',
              transform: 'translate(-50%,-50%)',
              boxShadow: '0 1px 3px rgba(0,0,0,.6)',
            }}
          />
        ))}
        <div
          style={{
            position: 'absolute',
            top: 6,
            left: 6,
            padding: '3px 6px',
            background: 'rgba(14,20,34,.86)',
            border: '1px solid rgba(96,165,250,.2)',
            borderRadius: 4,
            fontFamily: 'DM Mono',
            fontSize: 7,
            color: 'white',
          }}
        >
          MHS <b style={{ color: '#4ADE80' }}>81.2 ▲</b>
        </div>
      </div>

      {/* editorial */}
      <div
        style={{
          background: '#FAF8F2',
          borderLeft: '1px solid #DCD7C8',
          padding: '8px 10px',
          fontSize: 8.5,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            fontFamily: 'DM Mono',
            fontSize: 7,
            color: '#B0291F',
            letterSpacing: '.1em',
            fontWeight: 700,
            marginBottom: 3,
          }}
        >
          PROMESA INCUMPLIDA
        </div>
        <div
          style={{
            fontFamily: 'Fraunces, Georgia, serif',
            fontSize: 10.5,
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: '-.015em',
            color: '#0B0F19',
            marginBottom: 5,
          }}
        >
          La respuesta del Sector 14 se duplicó este trimestre
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
          <div>
            <div
              style={{
                fontFamily: 'Fraunces, serif',
                fontSize: 14,
                fontWeight: 800,
                color: '#B0291F',
                lineHeight: 1,
              }}
            >
              73h
            </div>
            <div style={{ fontSize: 6, color: '#888' }}>REAL</div>
          </div>
          <div>
            <div
              style={{
                fontFamily: 'Fraunces, serif',
                fontSize: 14,
                fontWeight: 800,
                color: '#16A34A',
                lineHeight: 1,
              }}
            >
              48h
            </div>
            <div style={{ fontSize: 6, color: '#888' }}>PROMESA</div>
          </div>
        </div>
        <div
          style={{
            borderTop: '1px dotted #DCD7C8',
            paddingTop: 4,
            fontSize: 7,
            fontFamily: 'DM Mono',
            color: '#888',
            letterSpacing: '.06em',
            textTransform: 'uppercase',
          }}
        >
          Ahora mismo · 4 live
        </div>
      </div>

      {/* KPI strip */}
      <div
        style={{
          gridColumn: '1 / -1',
          background: 'white',
          borderTop: '1px solid #1F1F1F',
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px',
          gap: 10,
          fontFamily: 'DM Mono',
          fontSize: 8,
        }}
      >
        <span style={{ color: '#16A34A', fontWeight: 800 }}>81.2</span>
        <span>47</span>
        <span style={{ color: '#16A34A' }}>31</span>
        <span>€47k</span>
        <span>71%</span>
        <span style={{ color: '#DC2626', fontWeight: 700 }}>18:00</span>
      </div>
    </div>
  )
}

const VARIANTS = [
  {
    to: '/',
    code: 'DIRECCIÓN A',
    title: 'Municipal Dashboard',
    desc: 'Shell de data-OS. Sidebar + Cmd+K, score MHS de portada, tabla de departamentos. El mapa se degrada a widget dentro de Quejas. Para ciudadanos diarios y periodistas de investigación.',
    meta: [['Densidad', '75'], ['SimCity', 'sutil'], ['Taxes', 'pestaña']],
    Thumb: ThumbA,
  },
  {
    to: '/hud',
    code: 'DIRECCIÓN B',
    title: 'City HUD',
    desc: 'SimCity en la vida real. Ciudad isométrica con cada euro y cada queja como partícula viva. HUD de KPIs siempre visible. Modos de juego por persona.',
    meta: [['Densidad', '60'], ['SimCity', 'fuerte'], ['Taxes', 'hero']],
    Thumb: ThumbB,
  },
  {
    to: '/briefing',
    code: 'DIRECCIÓN C',
    title: 'Civic Briefing',
    desc: 'Newsroom editorial. Boletín diario con portada, explicador de datos, recibo fiscal, tracker de promesas y agenda del pleno. El bot de Telegram replica el formato.',
    meta: [['Densidad', '90'], ['SimCity', 'mínimo'], ['Taxes', 'destacado']],
    Thumb: ThumbC,
  },
  {
    to: '/d',
    code: 'DIRECCIÓN D',
    title: 'El Mirador · A + C',
    desc: 'Mapa en vivo como portada, columna editorial con tipografía serif y tira de KPIs al pie. Fusiona la eficiencia data-OS de la A con la narrativa del Boletín. MVP centrado en Riba-roja de Túria (Comunitat Valenciana).',
    meta: [['Densidad', '80'], ['Mapa', 'hero'], ['Región', 'C. Valenciana']],
    Thumb: ThumbD,
    featured: true,
  },
]

export default function Chooser() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--surf)',
        color: 'var(--ink)',
        fontFamily: "'Outfit', system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '56px 32px' }}>
        <div
          className="mono"
          style={{
            fontSize: 11,
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '.08em',
            color: 'var(--ink50)',
          }}
        >
          CivicPulse · estudio de diseño
        </div>
        <h1
          style={{
            fontSize: 44,
            fontWeight: 700,
            letterSpacing: '-.02em',
            margin: '6px 0 12px',
          }}
        >
          Tres direcciones para un monitor cívico diario
        </h1>
        <p style={{ fontSize: 17, color: 'var(--ink60)', maxWidth: 720, lineHeight: 1.5 }}>
          La misma marca, los mismos datos, tres modelos mentales distintos. Elige uno para explorarlo —
          siempre puedes volver aquí desde el chip de esquina.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 20,
            marginTop: 40,
          }}
        >
          {VARIANTS.map((v) => {
            const Thumb = v.Thumb
            return (
              <Link
                key={v.to}
                to={v.to}
                style={{
                  background: 'var(--paper)',
                  borderRadius: 16,
                  border: v.featured ? '2px solid var(--civic)' : '1px solid var(--border2)',
                  overflow: 'hidden',
                  boxShadow: v.featured
                    ? '0 8px 32px rgba(36,99,235,.15)'
                    : '0 1px 2px rgb(11 15 25 / .04)',
                  transition: 'border-color .2s, box-shadow .2s, transform .2s',
                  textDecoration: 'none',
                  color: 'inherit',
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--civic)'
                  e.currentTarget.style.boxShadow = '0 8px 32px rgb(11 15 25 / .10)'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = v.featured ? 'var(--civic)' : 'var(--border2)'
                  e.currentTarget.style.boxShadow = v.featured
                    ? '0 8px 32px rgba(36,99,235,.15)'
                    : '0 1px 2px rgb(11 15 25 / .04)'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                {v.featured && (
                  <span
                    className="mono"
                    style={{
                      position: 'absolute',
                      top: 10,
                      right: 10,
                      background: 'var(--civic)',
                      color: 'white',
                      fontSize: 9,
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: 12,
                      letterSpacing: '.08em',
                      zIndex: 1,
                    }}
                  >
                    NUEVA
                  </span>
                )}
                <div
                  style={{
                    aspectRatio: '16/10',
                    position: 'relative',
                    overflow: 'hidden',
                    borderBottom: '1px solid var(--border2)',
                  }}
                >
                  <Thumb />
                </div>
                <div style={{ padding: '20px 22px 22px' }}>
                  <div
                    className="mono"
                    style={{
                      fontSize: 11,
                      color: 'var(--civic)',
                      fontWeight: 700,
                      letterSpacing: '.05em',
                    }}
                  >
                    {v.code}
                  </div>
                  <div
                    style={{
                      fontFamily: 'Outfit',
                      fontWeight: 700,
                      fontSize: 22,
                      margin: '6px 0 8px',
                      letterSpacing: '-.01em',
                    }}
                  >
                    {v.title}
                  </div>
                  <div style={{ fontSize: 13.5, color: 'var(--ink60)', lineHeight: 1.5, minHeight: 4.5 + 'em' }}>
                    {v.desc}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 12,
                      marginTop: 14,
                      paddingTop: 14,
                      borderTop: '1px solid var(--border2)',
                      fontSize: 11,
                      color: 'var(--ink50)',
                      flexWrap: 'wrap',
                    }}
                  >
                    {v.meta.map(([k, val]) => (
                      <span key={k}>
                        <b style={{ color: 'var(--ink)', fontWeight: 500 }}>{k}</b> {val}
                      </span>
                    ))}
                  </div>
                  <div
                    style={{
                      marginTop: 14,
                      fontSize: 13,
                      color: 'var(--civic)',
                      fontWeight: 500,
                    }}
                  >
                    Abrir dirección →
                  </div>
                </div>
              </Link>
            )
          })}
        </div>

        <div
          style={{
            marginTop: 60,
            fontSize: 12,
            color: 'var(--ink40)',
            display: 'flex',
            gap: 24,
            flexWrap: 'wrap',
          }}
        >
          <span>
            Cada dirección es independiente. La dirección A persiste tus ajustes (tema, densidad, persona) entre
            sesiones.
          </span>
        </div>
      </div>
    </div>
  )
}
