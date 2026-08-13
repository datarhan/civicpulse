import { Link } from 'react-router-dom'
import { Card, ExtLink, Pill, SectionHead, ShareWA } from '../components/Primitives'
import DataAsOf from '../components/DataAsOf'
import {
  useQuejas,
  STATE_LABEL,
  STATE_TONE,
  CATEGORY_LABEL,
  prettyNeighborhood,
} from '../hooks/useQuejas'
import { useCtbg } from '../hooks/useCtbg'
import { useSindicatura } from '../hooks/useSindicatura'
import { useBop, formatBopDate } from '../hooks/useBop'
import { useConsellCv } from '../hooks/useConsellCv'
import {
  useSindic,
  SINDIC_MATERIA_LABEL,
  SINDIC_SENTIDO_LABEL,
  SINDIC_SENTIDO_TONE,
} from '../hooks/useSindic'
import QuejasHeatmap from '../components/QuejasHeatmap'
import QuejasSpendOverlap from '../components/Quejas/QuejasSpendOverlap'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { fmtDateShort } from '../lib/formatters'
import { useT } from '../i18n'

const TELEGRAM_BOT_URL = 'https://t.me/munigraph_bot'

function SindicCard() {
  const { data } = useSindic()
  if (!data) return null
  const items = data.items || []
  return (
    <Card style={{ marginTop: 14 }}>
      <SectionHead
        eyebrow="Escalado externo · Síndic de Greuges CV"
        title="Resoluciones del Síndic sobre Riba-roja de Túria"
      />
      {items.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--ink70)', lineHeight: 1.55, marginTop: 8 }}>
          Aún no hay resoluciones del Síndic de Greuges CV registradas contra el Ayuntamiento de
          Riba-roja de Túria en nuestro registro curado. El Síndic publica sus resoluciones en{' '}
          <a
            href="https://www.elsindic.com/resolucions"
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--civic)' }}
          >
            elsindic.com
          </a>
          .
        </div>
      ) : (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.slice(0, 20).map((r) => (
            <div key={r.id} style={{ padding: '10px 0', borderTop: '1px dotted var(--border2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span
                  className="mono"
                  style={{ fontSize: 11, color: 'var(--civic)', fontWeight: 700 }}
                >
                  Expte {r.expediente}
                </span>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink50)' }}>
                  {fmtDateShort(r.fecha)}
                </span>
                <Pill tone={SINDIC_SENTIDO_TONE[r.sentido] || 'ghost'} size="xs">
                  {SINDIC_SENTIDO_LABEL[r.sentido] || r.sentido}
                </Pill>
                <Pill tone="ghost" size="xs">
                  {SINDIC_MATERIA_LABEL[r.materia] || r.materia}
                </Pill>
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>{r.titulo}</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink70)', marginTop: 4, lineHeight: 1.5 }}>
                {r.resumen}
              </div>
              <div style={{ marginTop: 6, fontSize: 11, display: 'flex', gap: 14 }}>
                <ExtLink href={r.urlPdf} style={{ color: 'var(--civic)' }}>
                  PDF del Síndic →
                </ExtLink>
                {r.quejaIdRelacionada && (
                  <Link
                    to={`/quejas/${r.quejaIdRelacionada.toLowerCase()}`}
                    style={{ color: 'var(--civic)' }}
                  >
                    Queja {r.quejaIdRelacionada} →
                  </Link>
                )}
              </div>
            </div>
          ))}
          <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink50)', marginTop: 6 }}>
            Lista curada manualmente · actualizado {fmtDateShort(data.generatedAt)}. Fuente:{' '}
            <a
              href="https://www.elsindic.com"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--civic)' }}
            >
              elsindic.com
            </a>
            .
          </div>
        </div>
      )}
    </Card>
  )
}

function Findings({ f, year }) {
  const groups = []
  const idx = new Map()
  for (const d of f.deficiencies || []) {
    if (!idx.has(d.category)) {
      idx.set(d.category, groups.length)
      groups.push([d.category, []])
    }
    groups[idx.get(d.category)][1].push(d)
  }
  const liStyle = { fontSize: 12, color: 'var(--ink70)', lineHeight: 1.45, marginBottom: 3 }
  const headStyle = {
    fontSize: 10.5,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '.04em',
  }
  return (
    <details style={{ marginTop: 6 }}>
      <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--civic)', fontWeight: 600 }}>
        {f.deficienciesCount} deficiencias · {f.recommendationsCount} recomendaciones (ejercicios{' '}
        {year === 2020 ? '2017-2019' : year})
      </summary>
      <div style={{ marginTop: 6, borderLeft: '2px solid var(--border2)', paddingLeft: 10 }}>
        {groups.map(([cat, items]) => (
          <div key={cat} style={{ marginBottom: 8 }}>
            <div style={{ ...headStyle, color: 'var(--ink50)' }}>{cat}</div>
            <ul style={{ margin: '3px 0 0', paddingLeft: 18 }}>
              {items.map((d) => (
                <li key={d.n} style={liStyle}>
                  {d.text}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {(f.recommendations || []).length > 0 && (
          <div style={{ marginTop: 6 }}>
            <div style={{ ...headStyle, color: 'var(--civic)' }}>
              Recomendaciones de la Sindicatura
            </div>
            <ol style={{ margin: '3px 0 0', paddingLeft: 18 }}>
              {f.recommendations.map((rec) => (
                <li key={rec.n} style={liStyle}>
                  {rec.text}
                </li>
              ))}
            </ol>
          </div>
        )}
        <div className="mono" style={{ fontSize: 10, color: 'var(--ink50)', marginTop: 6 }}>
          Extraído del informe firmado de la Sindicatura · última auditoría específica del
          municipio.
        </div>
      </div>
    </details>
  )
}

function Art218({ a }) {
  const Flag = ({ ok, notable, children }) => (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11.5,
        color: 'var(--ink70)',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          flexShrink: 0,
          background: ok ? 'var(--ok)' : notable ? 'var(--warn)' : 'var(--ink50)',
        }}
      />
      {children}
    </span>
  )
  return (
    <div
      style={{
        margin: '4px 0 8px',
        padding: '9px 11px',
        background: 'var(--soft)',
        border: '1px solid var(--border2)',
        borderRadius: 8,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '.04em',
          color: 'var(--ink50)',
          marginBottom: 6,
        }}
      >
        Rendición del control interno · ejercicio {a.ejercicio}{' '}
        <span style={{ fontWeight: 400, textTransform: 'none' }}>(art. 218 · lo más reciente)</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <Flag ok={a.enPlazo} notable={!a.enPlazo}>
          {a.enPlazo ? 'Rindió la información en plazo' : 'No rindió la información en plazo'}
        </Flag>
        <Flag ok={!a.acr} notable={a.acr}>
          {a.acr
            ? 'Comunicó acuerdos contrarios a reparos (la Intervención objetó y fue superada)'
            : 'Sin acuerdos contrarios a reparos'}
        </Flag>
        <Flag ok={!a.ofp} notable={a.ofp}>
          {a.ofp
            ? 'Comunicó omisiones de fiscalización previa'
            : 'Sin omisiones de fiscalización previa'}
        </Flag>
        <Flag ok={!a.ai} notable={a.ai}>
          {a.ai ? 'Comunicó anomalías de ingresos' : 'Sin anomalías de ingresos'}
        </Flag>
      </div>
      <div style={{ marginTop: 6, fontSize: 10.5 }}>
        <ExtLink href={a.sourceUrl} style={{ color: 'var(--civic)' }}>
          Informe de control interno EELL {a.ejercicio} →
        </ExtLink>
      </div>
    </div>
  )
}

function SindicaturaCard() {
  const { data } = useSindicatura()
  if (!data) return null
  const dedicated = data.dedicated || []
  const sectoral = data.sectoral || []
  const a218 = data.art218
  const st = data.stats || {}
  const Report = ({ r, dedicatedRow }) => (
    <div key={r.id} style={{ padding: '9px 0', borderTop: '1px dotted var(--border2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink50)', fontWeight: 700 }}>
          {r.year}
        </span>
        <Pill tone={dedicatedRow ? 'intel' : 'ghost'} size="xs">
          {dedicatedRow ? 'Auditoría específica' : 'Entidades locales'}
        </Pill>
      </div>
      <div style={{ fontSize: 13, fontWeight: dedicatedRow ? 600 : 500, lineHeight: 1.4 }}>
        {r.title}
      </div>
      <div style={{ marginTop: 5, fontSize: 11 }}>
        <ExtLink href={r.url} style={{ color: 'var(--civic)' }}>
          PDF de la Sindicatura →
        </ExtLink>
      </div>
      {r.findings && <Findings f={r.findings} year={r.year} />}
    </div>
  )
  return (
    <Card style={{ marginTop: 14 }}>
      <SectionHead
        eyebrow="Fiscalización externa · Sindicatura de Comptes CV"
        title="Auditorías del órgano de control externo sobre Riba-roja"
      />
      {dedicated.length === 0 && sectoral.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--ink70)', lineHeight: 1.55, marginTop: 8 }}>
          Aún no consta ninguna fiscalización de la{' '}
          <a
            href="https://www.sindicom.gva.es/informes"
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--civic)' }}
          >
            Sindicatura de Comptes
          </a>{' '}
          que nombre a Riba-roja de Túria.
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--ink50)', lineHeight: 1.5, marginBottom: 4 }}>
            La Sindicatura audita <em>a posteriori</em> si el dinero público se gestionó
            correctamente — el complemento fiscalizador al Síndic de Greuges y el CTBG.
          </div>
          {a218 && <Art218 a={a218} />}
          {dedicated.map((r) => (
            <Report key={r.id} r={r} dedicatedRow />
          ))}
          {sectoral.length > 0 && (
            <details style={{ marginTop: 8 }}>
              <summary
                style={{ cursor: 'pointer', fontSize: 12, color: 'var(--civic)', fontWeight: 600 }}
              >
                Riba-roja como entidad auditada en {st.sectoralRelevant ?? sectoral.length} barridos
                sectoriales de entidades locales
              </summary>
              <div style={{ marginTop: 4 }}>
                {sectoral.map((r) => (
                  <Report key={r.id} r={r} dedicatedRow={false} />
                ))}
                {/* The snapshot caps the list; the count above is the full
                    total. Saying "28" and listing 15 without a word reads as a
                    rendering bug or a silent omission. */}
                {st.sectoralRelevant > sectoral.length && (
                  <div
                    className="mono"
                    style={{ fontSize: 10.5, color: 'var(--ink50)', marginTop: 6 }}
                  >
                    Mostrando los {sectoral.length} más recientes de {st.sectoralRelevant}.
                  </div>
                )}
              </div>
            </details>
          )}
          <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink50)', marginTop: 8 }}>
            {st.dedicated ?? dedicated.length} auditoría(s) específica(s) · {st.sectoralTotal ?? 0}{' '}
            menciones en total · actualizado {fmtDateShort(data.generatedAt)}. Fuente:{' '}
            <a
              href="https://www.sindicom.gva.es"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--civic)' }}
            >
              sindicom.gva.es
            </a>
            .
          </div>
        </div>
      )}
    </Card>
  )
}

function ConsellCvCard() {
  const { data } = useConsellCv()
  if (!data) return null
  const { stats, matched } = data
  const when = fmtDateShort(data.generatedAt)
  // «Desestimatoria» CONTAINS «estimatoria», so testing the shorter pattern
  // first matched both and made the branch below it unreachable: a REJECTED
  // appeal would render in the colour that means the council was found wrong.
  // The negative case is tested first because it is the longer word — the same
  // longest-match-wins rule canonicalizeDepartment uses, for the same reason.
  const sentidoColor = (s) => {
    if (/desestimat/i.test(s)) return 'var(--ok)'
    if (/estimat/i.test(s)) return 'var(--warn)'
    return 'var(--ink50)'
  }
  return (
    <Card style={{ marginTop: 14 }}>
      <SectionHead
        eyebrow="Escalado externo · Consell de Transparència CV"
        title="Resoluciones autonómicas de transparencia"
      />
      <div style={{ display: 'flex', gap: 20, marginTop: 10, flexWrap: 'wrap' }}>
        <div>
          <div
            className="mono"
            style={{
              fontSize: 10,
              color: 'var(--ink50)',
              textTransform: 'uppercase',
              letterSpacing: '.06em',
            }}
          >
            Registro analizado
          </div>
          <div className="mono" style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>
            {stats.totalEntries.toLocaleString('es-ES')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink50)' }}>
            resoluciones · {stats.years.length} año(s)
          </div>
        </div>
        <div>
          <div
            className="mono"
            style={{
              fontSize: 10,
              color: 'var(--ink50)',
              textTransform: 'uppercase',
              letterSpacing: '.06em',
            }}
          >
            Contra Riba-roja
          </div>
          <div
            className="mono"
            style={{
              fontSize: 18,
              fontWeight: 800,
              marginTop: 2,
              // Variantes -ink: a 18 px, aunque vaya en 800, WCAG sigue
              // considerándolo texto pequeño —su umbral de negrita es 18,66 px—
              // y --ok daba 3,3:1 sobre blanco. La regla del repo dice «tonos
              // base sólo en ≥18px/bold»; esta cifra cae justo en ese hueco.
              color: stats.matchedEntries > 0 ? 'var(--crit-ink)' : 'var(--ok-ink)',
            }}
          >
            {stats.matchedEntries}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink50)' }}>
            {stats.matchedEntries === 0
              ? 'sin reclamaciones transparencia resueltas'
              : `${Object.keys(stats.bySentido).length} sentidos distintos`}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink50)' }}>
          Comprobado {when} ·{' '}
          <ExtLink
            href={data.source?.portal || 'https://conselltransparencia.gva.es'}
            style={{ color: 'var(--civic)' }}
          >
            conselltransparencia.gva.es
          </ExtLink>
        </div>
      </div>
      {matched && matched.length > 0 && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {matched.slice(0, 10).map((m, i) => (
            <div key={i} style={{ padding: '10px 0', borderTop: '1px dotted var(--border2)' }}>
              <div
                className="mono"
                style={{ fontSize: 11, color: 'var(--civic)', fontWeight: 700 }}
              >
                Nº {m.numero} · Expte {m.expediente} · {m.fecha}
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, marginTop: 2 }}>{m.motivo || '—'}</div>
              <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink50)', marginTop: 2 }}>
                <span style={{ color: sentidoColor(m.sentido), fontWeight: 600 }}>{m.sentido}</span>
                {m.materia && <> · {m.materia}</>}
              </div>
            </div>
          ))}
        </div>
      )}
      {stats.matchedEntries === 0 && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--ink50)', lineHeight: 1.55 }}>
          El Consell de Transparència CV es el órgano autonómico que resuelve reclamaciones
          municipales de transparencia (art. 24 Ley 19/2013 + Ley 1/2022). Un "0" aquí es un dato en
          sí mismo: no se ha escalado formalmente ningún silencio del Ayuntamiento de Riba-roja en
          el periodo verificado.
        </div>
      )}
    </Card>
  )
}

function CtbgCard() {
  const { data } = useCtbg()
  if (!data) return null
  const { stats, matched } = data
  const when = fmtDateShort(data.generatedAt)
  return (
    <Card style={{ marginTop: 14 }}>
      <SectionHead
        eyebrow="Escalado externo · CTBG"
        title="Resoluciones estatales sobre Riba-roja"
      />
      <div style={{ display: 'flex', gap: 20, marginTop: 10, flexWrap: 'wrap' }}>
        <div>
          <div
            className="mono"
            style={{
              fontSize: 10,
              color: 'var(--ink50)',
              textTransform: 'uppercase',
              letterSpacing: '.06em',
            }}
          >
            Registro analizado
          </div>
          <div className="mono" style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>
            {stats.totalEntries.toLocaleString('es-ES')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink50)' }}>
            resoluciones · {stats.years.length} años
          </div>
        </div>
        <div>
          <div
            className="mono"
            style={{
              fontSize: 10,
              color: 'var(--ink50)',
              textTransform: 'uppercase',
              letterSpacing: '.06em',
            }}
          >
            Mencionan Riba-roja
          </div>
          <div
            className="mono"
            style={{
              fontSize: 18,
              fontWeight: 800,
              marginTop: 2,
              // Variantes -ink: a 18 px, aunque vaya en 800, WCAG sigue
              // considerándolo texto pequeño —su umbral de negrita es 18,66 px—
              // y --ok daba 3,3:1 sobre blanco. La regla del repo dice «tonos
              // base sólo en ≥18px/bold»; esta cifra cae justo en ese hueco.
              color: stats.matchedEntries > 0 ? 'var(--crit-ink)' : 'var(--ok-ink)',
            }}
          >
            {stats.matchedEntries}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink50)' }}>
            {stats.matchedEntries === 0
              ? 'sin resoluciones (ámbito estatal)'
              : `${Object.keys(stats.bySentido).length} sentidos distintos`}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink50)' }}>
          Comprobado {when} ·{' '}
          <ExtLink href={data.source?.url} style={{ color: 'var(--civic)' }}>
            XLSX oficial
          </ExtLink>
        </div>
      </div>
      {matched && matched.length > 0 && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {matched.slice(0, 5).map((m, i) => (
            <div key={i} style={{ padding: '10px 0', borderTop: '1px dotted var(--border2)' }}>
              <div
                className="mono"
                style={{ fontSize: 11, color: 'var(--civic)', fontWeight: 700 }}
              >
                {m.resolucion} · {m.mesResolucion} {m.sheetYear}
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, marginTop: 2 }}>{m.asunto}</div>
              <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink50)', marginTop: 2 }}>
                {m.sentido} · {m.organismo}
              </div>
            </div>
          ))}
        </div>
      )}
      {stats.matchedEntries === 0 && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--ink50)', lineHeight: 1.55 }}>
          El CTBG gestiona reclamaciones de ámbito estatal. Las reclamaciones municipales se
          tramitan ante el
          <strong> Consell de Transparència de la Comunitat Valenciana</strong>. El Síndic de
          Greuges CV es la vía de escalado general cuando el Ayuntamiento no responde (3 meses
          LPACAP).
        </div>
      )}
    </Card>
  )
}

function EmptyState() {
  return (
    <>
      <Card>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <Pill tone="civic" size="xs">
            Canal abierto · sin datos aún
          </Pill>
          <Pill tone="ghost" size="xs">
            Telegram · SQLite · Open311
          </Pill>
        </div>
        <SectionHead
          eyebrow="Estado"
          title="El canal de quejas ciudadanas ya está abierto — no hay datos todavía"
        />
        <div style={{ fontSize: 14, color: 'var(--ink70)', lineHeight: 1.55, marginTop: 8 }}>
          <p>
            CivicPulse opera su propio canal de quejas ciudadanas vía el bot de Telegram{' '}
            <a
              href={TELEGRAM_BOT_URL}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--civic)' }}
            >
              @munigraph_bot
            </a>
            . Cada vecino puede presentar una queja en 2 minutos y seguir su estado en tiempo real.
          </p>
          <p>
            Esta página publica el feed agregado — categoría, barrio, plazo legal y estado —{' '}
            <strong>nunca identifica al vecino</strong>. Las quejas con 10 apoyos vecinales entran
            en el lote semanal al Registro Electrónico del Ayuntamiento. Si el Ayuntamiento no
            responde en 3 meses, escalamos al Síndic de Greuges de la Comunitat Valenciana.
          </p>
        </div>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="Cómo funciona" title="De la queja al escalado" />
        <ol
          style={{
            fontSize: 13.5,
            color: 'var(--ink70)',
            marginTop: 8,
            lineHeight: 1.6,
            paddingLeft: 20,
          }}
        >
          <li>
            <strong>Presenta</strong> tu queja al bot: <code>/queja</code> — categoría, foto,
            ubicación.
          </li>
          <li>
            <strong>Tus vecinos la apoyan</strong> con <code>/apoyar Q-XXXX</code>. A 10 apoyos
            entra al lote oficial.
          </li>
          <li>
            <strong>Lote semanal al sede</strong>: cada lunes un voluntario firma las quejas
            verificadas con Cl@ve.
          </li>
          <li>
            <strong>3 meses legales</strong> (1 mes si es transparencia). Base legal: art. 21.3 y 24
            LPACAP.
          </li>
          <li>
            <strong>Silencio → Síndic de Greuges CV</strong>: plantilla autogenerada y pública.
          </li>
        </ol>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="Contratos editoriales" title="Qué publicamos y qué no" />
        <div style={{ fontSize: 13, color: 'var(--ink70)', marginTop: 8, lineHeight: 1.55 }}>
          <ul style={{ paddingLeft: 20 }}>
            <li>
              Publicamos: categoría, barrio (agregado), estado, apoyos, área municipal responsable,
              concejal político y, si la adjuntas, la foto{' '}
              <strong>anonimizada automáticamente</strong> (caras y matrículas difuminadas,
              metadatos EXIF eliminados).
            </li>
            <li>
              No publicamos: identidad del denunciante, la foto original sin anonimizar, lat/lng
              exactas, personal técnico municipal.
            </li>
            <li>
              Los plazos y bases legales provienen del BOE. El escalado externo es al Síndic CV /
              CTBG, instituciones con autoridad estatutaria.
            </li>
            <li>
              Ver{' '}
              <a href="/metodologia" style={{ color: 'var(--civic)' }}>
                Metodología
              </a>{' '}
              y{' '}
              <a href="/aviso-legal" style={{ color: 'var(--civic)' }}>
                Aviso legal
              </a>{' '}
              para el contrato completo.
            </li>
          </ul>
        </div>
      </Card>
    </>
  )
}

function StatCard({ label, value, tone = 'neutral', sub }) {
  const color =
    tone === 'ok'
      ? 'var(--ok)'
      : tone === 'warn'
        ? 'var(--warn)'
        : tone === 'crit'
          ? 'var(--crit)'
          : tone === 'civic'
            ? 'var(--civic)'
            : 'var(--ink)'
  return (
    <Card>
      <div
        className="mono"
        style={{
          fontSize: 10.5,
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
        }}
      >
        {label}
      </div>
      <div
        className="mono"
        style={{ fontSize: 26, fontWeight: 800, color, marginTop: 4, letterSpacing: '-.02em' }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--ink50)', marginTop: 3 }}>{sub}</div>}
    </Card>
  )
}

function DashboardView({ data }) {
  const items = data.items || []
  const stats = data.stats || { total: 0, byState: {}, byNeighborhood: {}, byCategory: {} }

  const resueltas = stats.byState.resuelta || 0
  const silencios = (stats.byState.silencio_negativo || 0) + (stats.byState.escalada_sindic || 0)
  const pendientes =
    (stats.byState.capturada || 0) +
    (stats.byState.apoyada_verificada || 0) +
    (stats.byState.registrada || 0) +
    (stats.byState.notificada_10d || 0) +
    (stats.byState.en_tramite || 0)
  const resolucionPct = stats.total > 0 ? Math.round((resueltas / stats.total) * 100) : 0

  // The LPACAP clock only starts once a queja is registered in sede. Until then
  // "silencios: 0" is arithmetic, not municipal performance — it cannot be
  // anything else — yet it reads as "nobody has been left unanswered". Show the
  // metric only when at least one queja could actually have breached the plazo.
  const conRelojEnMarcha = items.filter((q) => q.registered_at).length

  const sortedCats = Object.entries(stats.byCategory || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
  const sortedNeigh = Object.entries(stats.byNeighborhood || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)

  return (
    <>
      <QuejasHeatmap />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
          marginBottom: 18,
        }}
      >
        <StatCard label="Total quejas" value={stats.total} sub="desde el inicio del canal" />
        <StatCard
          label="Resueltas"
          value={resueltas}
          tone="ok"
          sub={`${resolucionPct}% del total`}
        />
        <StatCard
          label="Pendientes"
          value={pendientes}
          tone="civic"
          sub="capturadas + en trámite"
        />
        <StatCard
          label="Silencios + escaladas"
          value={conRelojEnMarcha === 0 ? '—' : silencios}
          tone={conRelojEnMarcha === 0 ? 'ghost' : 'warn'}
          sub={
            conRelojEnMarcha === 0
              ? 'ninguna queja registrada en sede todavía'
              : `>plazo LPACAP · sobre ${conRelojEnMarcha} registrada${conRelojEnMarcha === 1 ? '' : 's'}`
          }
        />
      </div>

      <QuejasSpendOverlap />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 14,
          marginBottom: 18,
        }}
      >
        <Card>
          <SectionHead eyebrow="Por categoría" title="Qué se reporta más" />
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sortedCats.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--ink50)' }}>—</div>
            )}
            {sortedCats.map(([cat, n]) => (
              <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, fontSize: 13 }}>{CATEGORY_LABEL[cat] || cat}</span>
                <span
                  className="mono"
                  style={{ fontSize: 12, color: 'var(--ink50)', minWidth: 24, textAlign: 'right' }}
                >
                  {n}
                </span>
                <div
                  style={{
                    width: 80,
                    height: 6,
                    background: 'var(--border2)',
                    borderRadius: 3,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, (n / Math.max(...sortedCats.map((c) => c[1]))) * 100)}%`,
                      height: '100%',
                      background: 'var(--civic)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <SectionHead eyebrow="Por barrio" title="Dónde pasa" />
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sortedNeigh.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--ink50)' }}>—</div>
            )}
            {sortedNeigh.map(([slug, n]) => (
              <div key={slug} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, fontSize: 13 }}>{prettyNeighborhood(slug)}</span>
                <span
                  className="mono"
                  style={{ fontSize: 12, color: 'var(--ink50)', minWidth: 24, textAlign: 'right' }}
                >
                  {n}
                </span>
                <div
                  style={{
                    width: 80,
                    height: 6,
                    background: 'var(--border2)',
                    borderRadius: 3,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, (n / Math.max(...sortedNeigh.map((c) => c[1]))) * 100)}%`,
                      height: '100%',
                      background: 'var(--ok)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <SectionHead eyebrow="Quejas recientes · feed público" title="Últimas 30 quejas" />
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--ink50)' }}>
              Aún no hay quejas registradas.
            </div>
          )}
          {items.slice(0, 30).map((it) => (
            <Link
              key={it.service_request_id}
              to={`/quejas/${it.service_request_id.toLowerCase()}`}
              style={{
                display: 'grid',
                gridTemplateColumns: 'min-content 1fr min-content min-content min-content',
                alignItems: 'center',
                gap: 12,
                padding: '10px 0',
                borderBottom: '1px dotted var(--border2)',
                color: 'inherit',
                textDecoration: 'none',
              }}
            >
              <span className="mono" style={{ fontSize: 11, color: 'var(--ink50)' }}>
                {it.service_request_id}
              </span>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13.5,
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {it.description}
                </div>
                <div
                  className="mono"
                  style={{ fontSize: 10.5, color: 'var(--ink50)', marginTop: 2 }}
                >
                  {CATEGORY_LABEL[it.service_code] || it.service_code}
                  {it.address_string ? ` · ${prettyNeighborhood(it.address_string)}` : ''}
                  {it.concejalia_area ? ` · ${it.concejalia_area}` : ''}
                </div>
              </div>
              <span
                className="mono"
                style={{ fontSize: 11, color: 'var(--ink50)', textAlign: 'right' }}
              >
                👍 {it.apoyos}
              </span>
              <ShareWA
                text={`Queja ${it.service_request_id} · ${CATEGORY_LABEL[it.service_code] || it.service_code}\n${it.description.slice(0, 140)}`}
                url={`https://civicpulse.es/quejas/${it.service_request_id.toLowerCase()}`}
              />
              <Pill tone={STATE_TONE[it.status] || 'ghost'} size="xs">
                {STATE_LABEL[it.status] || it.status}
              </Pill>
            </Link>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink50)', marginTop: 12 }}>
          Snapshot: {data.generatedAt ? new Date(data.generatedAt).toLocaleString('es-ES') : '—'} ·{' '}
          Fuente: {data.source?.platform} · Formato: {data.source?.spec}
        </div>
      </Card>
    </>
  )
}

function BopCard() {
  const { data } = useBop()
  if (!data) return null
  const anuncios = (data.anuncios || []).slice(0, 6)
  const covered = data.stats?.daysCovered ?? null
  const requested = data.stats?.daysRequested ?? null
  const when = fmtDateShort(data.generatedAt)
  return (
    <Card style={{ marginTop: 14 }}>
      <SectionHead
        eyebrow="Edictos oficiales · BOP València"
        title="Anuncios del Ayuntamiento en el Boletín Oficial de la Provincia"
      />
      {anuncios.length === 0 ? (
        <div style={{ marginTop: 10, fontSize: 13, color: 'var(--ink50)' }}>
          {/* The window we ASKED for and the window we actually read are not the
              same number — 21 of 30 bulletins loaded on the current snapshot —
              and saying "in the last 30 days" implies we looked at all 30. */}
          {covered != null && requested != null && covered < requested
            ? `Sin anuncios del Ayuntamiento en los ${covered} boletines del BOP que hemos podido leer (ventana de ${requested} días).`
            : 'Sin anuncios del Ayuntamiento en el BOP en los últimos 30 días.'}
        </div>
      ) : (
        <div style={{ marginTop: 10 }}>
          {anuncios.map((a, i) => (
            <div
              key={a.id}
              style={{ padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}
            >
              <div
                className="mono"
                style={{ fontSize: 10, color: 'var(--ink50)', marginBottom: 2 }}
              >
                {formatBopDate(a.date)} · Reg. {a.regNumber}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>
                <ExtLink href={a.pdfUrl} style={{ color: 'inherit', textDecoration: 'none' }}>
                  {a.title}
                </ExtLink>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--ink50)' }}>
        {data.stats?.total ?? 0} anuncio(s) · comprobado {when} ·{' '}
        <ExtLink href={data.source?.home} style={{ color: 'var(--civic)' }}>
          BOP oficial
        </ExtLink>
      </div>
    </Card>
  )
}

export default function Quejas() {
  const t = useT()
  useDocumentTitle(t('quejas.title'))
  const { loading, error, data } = useQuejas()

  return (
    <div
      className="cp-page"
      style={{ padding: '24px 24px 48px', maxWidth: 1100, margin: '0 auto' }}
    >
      <div style={{ marginBottom: 18 }}>
        <div
          className="mono"
          style={{
            fontSize: 10.5,
            color: 'var(--ink50)',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
          }}
        >
          {t('quejas.eyebrow')}
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.015em', marginTop: 2 }}>
          {t('quejas.title')}
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--ink50)', marginTop: 4, maxWidth: 620 }}>
          Canal público de quejas para Riba-roja. Presenta vía Telegram ·{' '}
          <a
            href={TELEGRAM_BOT_URL}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--civic)' }}
          >
            @munigraph_bot
          </a>
          . Feed agregado y anónimo — base legal LPACAP + Ley 19/2013.{' '}
          <Link
            to="/quejas/dashboard"
            style={{ color: 'var(--civic)', textDecoration: 'underline', textUnderlineOffset: 2 }}
          >
            Dashboard analítico →
          </Link>
        </div>
        <div style={{ marginTop: 10 }}>
          <DataAsOf iso={data?.generatedAt} label="Quejas" />
        </div>
      </div>

      {loading && <div style={{ color: 'var(--ink50)', fontSize: 13 }}>Cargando feed…</div>}
      {error && (
        <Card>
          <div style={{ color: 'var(--warn)', fontSize: 13 }}>
            No se pudo cargar /data/quejas.json. Puede que el bot aún no haya publicado su primer
            snapshot.
          </div>
        </Card>
      )}
      {!loading && !error && data && (data.stats?.total ?? 0) === 0 && <EmptyState />}
      {!loading && !error && data && (data.stats?.total ?? 0) > 0 && <DashboardView data={data} />}
      <SindicCard />
      <SindicaturaCard />
      <ConsellCvCard />
      <CtbgCard />
      <BopCard />
    </div>
  )
}
