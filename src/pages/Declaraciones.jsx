import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, Pill, SectionHead, PartyTag } from '../components/Primitives'
import DataAsOf from '../components/DataAsOf'
import { MarcaDeFirma } from '../components/MarcaDeFirma'
import {
  usePlenoClaims,
  CLAIM_TYPE_LABEL,
  CLAIM_TYPE_TONE,
  VERDICT_LABEL,
  VERDICT_TONE,
} from '../hooks/usePlenoClaims'
import { usePlenos } from '../hooks/usePlenos'
import { useOfficials } from '../hooks/useOfficials'
import { PARTY_TONE } from '../hooks/usePromises'
import { useLocale, useT } from '../i18n'
import { CLAIM_VERDICTS, resumirSinDatos, desenlaceDeCotejo } from '../scraper/claim-verdicts'
import { oneSeatBlocsOf } from '../scraper/corporation-seats'
import { blocLabel } from '../lib/party-label.js'
import { etiquetaVerificador, evidenciaSegunFuentes } from '../lib/claim-provenance.js'
import { PuenteDeImporte } from '../components/PuenteDeImporte'

const PAGE_SIZE = 50

function MiniStat({ label, value, tone }) {
  const color =
    tone === 'warn'
      ? 'var(--warn-ink)'
      : tone === 'crit'
        ? 'var(--crit-ink)'
        : tone === 'ok'
          ? 'var(--ok-ink)'
          : 'var(--ink)'
  return (
    <div
      style={{
        padding: '10px 12px',
        border: '1px solid var(--border2)',
        borderRadius: 'var(--r-input)',
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.06em',
        }}
      >
        {label}
      </div>
      <div
        className="mono"
        style={{ fontSize: 'var(--fs-head)', fontWeight: 600, color, marginTop: 2 }}
      >
        {value.toLocaleString('es-ES')}
      </div>
    </div>
  )
}

function FilterChip({ active, label, count, onClick, tone }) {
  const inactiveColor = 'var(--ink50)'
  const activeBg =
    tone === 'ok'
      ? 'var(--ok-soft)'
      : tone === 'warn'
        ? 'var(--warn-soft)'
        : tone === 'crit'
          ? 'var(--crit-soft)'
          : 'var(--soft)'
  const activeFg =
    tone === 'ok'
      ? 'var(--ok-ink)'
      : tone === 'warn'
        ? 'var(--warn-ink)'
        : tone === 'crit'
          ? 'var(--crit-ink)'
          : 'var(--ink)'
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '4px 10px',
        borderRadius: 'var(--r-input)',
        fontSize: 'var(--fs-micro)',
        fontWeight: active ? 600 : 500,
        border: '1px solid ' + (active ? 'transparent' : 'var(--border2)'),
        background: active ? activeBg : 'transparent',
        color: active ? activeFg : inactiveColor,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
      {count != null && (
        <span className="mono" style={{ marginLeft: 6, fontSize: 'var(--fs-micro)' }}>
          {count.toLocaleString('es-ES')}
        </span>
      )}
    </button>
  )
}

function ClaimRow({ item, plenoTitle }) {
  const c = item.claim
  const v = item.verification
  // Sin `|| 'var(--ink50)'`: PartyTag ya distingue «hay color de partido» de
  // «no lo hay», y colar aquí un gris de relleno le haría pintar una pastilla
  // gris sobre una formación que no reconocemos.
  const speakerColor = c.speakerGroup ? PARTY_TONE[c.speakerGroup] : undefined
  const ent = []
  if (c.entities?.amountEuros) ent.push('€' + c.entities.amountEuros.toLocaleString('es-ES'))
  if (c.entities?.count)
    ent.push(c.entities.count + (c.entities.countUnit ? ' ' + c.entities.countUnit : ''))
  if (c.entities?.date) ent.push(c.entities.date)
  // Las filas que pinta /plenos/:id, con la misma regla: el expediente «que se
  // parece» de una verificación que no cotejó contratos no se cuenta como
  // evidencia (src/lib/claim-provenance.js).
  const evidencia = evidenciaSegunFuentes(v)
  return (
    <Card>
      {/* La envoltura y el encogido viven en index.css (.cp-claim-head): una
          media query no cabe en el prop `style`, y esta fila es la que
          desbordaba /declaraciones en un teléfono de 375px. */}
      <div
        className="cp-claim-head"
        style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}
      >
        <Pill tone={VERDICT_TONE[v.verdict] ?? 'neutral'} size="xs">
          {VERDICT_LABEL[v.verdict] ?? v.verdict}
        </Pill>
        <Pill tone={CLAIM_TYPE_TONE[c.type] ?? 'neutral'} size="xs">
          {CLAIM_TYPE_LABEL[c.type] ?? c.type}
        </Pill>
        <PartyTag
          tone={speakerColor}
          style={{ fontSize: 'var(--fs-micro)', letterSpacing: '.04em' }}
        >
          {c.speakerGroup ? blocLabel(c.speakerGroup) : 'sin atribuir'}
        </PartyTag>
        <MarcaDeFirma
          claim={c}
          style={{ fontSize: 'var(--fs-micro)', letterSpacing: '.04em', color: 'var(--ink50)' }}
        />
        <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>· {c.topic}</span>
        <span style={{ flex: 1 }} />
        <Link
          to={`/plenos`}
          style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', textDecoration: 'none' }}
          title={plenoTitle ?? c.plenoId}
        >
          {c.plenoDate}
        </Link>
      </div>
      <div style={{ fontSize: 'var(--fs-aux)', lineHeight: 1.5, marginBottom: 6 }}>
        «{c.verbatim}»
      </div>
      {ent.length > 0 && (
        <div
          className="mono"
          style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginBottom: 6 }}
        >
          {ent.join(' · ')}
        </div>
      )}
      {evidencia.length > 0 && (
        <div
          style={{
            marginTop: 6,
            paddingTop: 6,
            borderTop: '1px dashed var(--border2)',
            fontSize: 'var(--fs-aux)',
            color: 'var(--ink50)',
            lineHeight: 1.5,
          }}
        >
          <div
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              color: 'var(--ink50)',
              marginBottom: 3,
            }}
          >
            {evidencia.length} {evidencia.length === 1 ? 'evidencia' : 'evidencias'} ·{' '}
            {etiquetaVerificador(v)}
          </div>
          {evidencia.slice(0, 2).map((e, i) => (
            <div key={i} style={{ marginTop: 2 }}>
              <span
                className="mono"
                style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginRight: 6 }}
              >
                [{e.kind}]
              </span>
              {e.snippet}
              <PuenteDeImporte cifra={c.entities?.amountEuros} evidencia={e} />
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// El ORDEN de pintado es una decisión de presentación y vive aquí; el CONJUNTO
// viene del enum, para que no puedan separarse. Un veredicto nuevo que nadie
// haya ordenado aparece al final en vez de desaparecer en silencio, que es lo
// que hacía la lista copiada a mano (regla 1 de docs/DATA_INTEGRITY.md).
const ORDEN_VERDICTS = ['verificado', 'parcial', 'contradicho', 'promesa-repetida', 'sin-datos']
const ALL_VERDICTS = [
  ...ORDEN_VERDICTS.filter((v) => CLAIM_VERDICTS.includes(v)),
  ...CLAIM_VERDICTS.filter((v) => !ORDEN_VERDICTS.includes(v)),
]
// Los filtros que afinan «sin-datos», cada uno con el desenlace que deja pasar.
// Es la regla de la línea «Fuentes comprobadas» de las tarjetas
// (`desenlaceDeCotejo`), así que el recuento y la tarjeta no pueden separarse:
// una retractación del motor salía aquí «sin corpus que consultar» mientras su
// tarjeta decía «no constan» (2026-09-29).
const FILTROS_SIN_DATOS = {
  'comprobado-sin-hallar': 'con-corpus',
  'sin-corpus': 'sin-corpus',
  'no-consta': 'no-consta',
}
// The five groups holding seats in this corporación, plus `null` for claims
// whose group could not be determined. `Otro` used to sit in this list and was
// rendered as a chip labelled with the raw code — the one surface where a
// reader actually saw the word, since the chip prints `b` rather than passing
// it through blocLabel(). It named no group and its claims now carry `null`.
const ALL_BLOCS = ['PSOE', 'PP', 'VOX', 'Compromís', 'EU-Podem', null]

export default function Declaraciones() {
  const t = useT()
  const { locale } = useLocale()
  const claims = usePlenoClaims()
  const plenos = usePlenos()
  const officials = useOfficials()
  // Los grupos de un escaño, de la composición publicada. Mientras no se ha
  // leído —o si no trae composición— es null y la página no dice nada, en vez
  // de decir una lista que nadie ha leído.
  const unEscano = useMemo(
    () => (officials.data ? oneSeatBlocsOf(officials.data) : null),
    [officials.data],
  )
  const [verdictFilter, setVerdictFilter] = useState('with-evidence') // 'all' | 'with-evidence' | one-of-ALL_VERDICTS
  const [blocFilter, setBlocFilter] = useState('all') // 'all' | one-of-ALL_BLOCS | 'attributed' | 'null'
  const [topicFilter, setTopicFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [shown, setShown] = useState(PAGE_SIZE)

  const items = useMemo(() => claims.data?.items ?? [], [claims.data])

  // Aggregate counts for the chip badges, computed once per snapshot.
  const stats = useMemo(() => {
    const byVerdict = Object.fromEntries(CLAIM_VERDICTS.map((v) => [v, 0]))
    const byBloc = { PSOE: 0, PP: 0, VOX: 0, Compromís: 0, 'EU-Podem': 0, null: 0 }
    const topics = new Set()
    for (const it of items) {
      byVerdict[it.verification.verdict] = (byVerdict[it.verification.verdict] ?? 0) + 1
      const b = it.claim.speakerGroup ?? 'null'
      byBloc[b] = (byBloc[b] ?? 0) + 1
      topics.add(it.claim.topic)
    }
    return {
      total: items.length,
      byVerdict,
      withEvidence: byVerdict.verificado + byVerdict.parcial + byVerdict.contradicho,
      // El mismo reparto que publica el manifiesto, recontado aquí sobre los
      // items cargados para que las dos cifras no puedan separarse.
      sinDatosPorque: resumirSinDatos(items.map((it) => it.verification)),
      byBloc,
      topics: [...topics].sort(),
    }
  }, [items])

  // La nota dice de estos grupos que sus declaraciones salen sin grupo, y eso
  // es una afirmación sobre los datos: sólo se nombra a los que de verdad no
  // llevan ninguna atribuida. Uno que la lleve —hasta que se retire, o si una
  // persona la firma— tiene su botón arriba y no se le nombra aquí.
  const unEscanoSinBoton = useMemo(
    () => (unEscano ?? []).filter((g) => (stats.byBloc[g] ?? 0) === 0),
    [unEscano, stats],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((it) => {
      if (verdictFilter === 'with-evidence') {
        if (!['verificado', 'parcial', 'contradicho'].includes(it.verification.verdict))
          return false
      } else if (Object.hasOwn(FILTROS_SIN_DATOS, verdictFilter)) {
        if (it.verification.verdict !== 'sin-datos') return false
        if (desenlaceDeCotejo(it.verification) !== FILTROS_SIN_DATOS[verdictFilter]) return false
      } else if (verdictFilter !== 'all' && it.verification.verdict !== verdictFilter) {
        return false
      }
      if (blocFilter === 'attributed') {
        if (!it.claim.speakerGroup) return false
      } else if (blocFilter === 'null') {
        if (it.claim.speakerGroup) return false
      } else if (blocFilter !== 'all' && it.claim.speakerGroup !== blocFilter) {
        return false
      }
      if (topicFilter !== 'all' && it.claim.topic !== topicFilter) return false
      if (q && !it.claim.verbatim.toLowerCase().includes(q)) return false
      return true
    })
  }, [items, verdictFilter, blocFilter, topicFilter, search])

  // Reset pagination when filters change.
  const filtersKey = verdictFilter + '|' + blocFilter + '|' + topicFilter + '|' + search
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemo(() => setShown(PAGE_SIZE), [filtersKey])

  // Index plenoId → title for the inline date link tooltip.
  const plenoIndex = useMemo(() => {
    const m = new Map()
    for (const p of plenos.data?.items ?? []) m.set(p.id, p.title)
    return m
  }, [plenos.data])

  if (claims.loading) {
    return (
      <div style={{ padding: 32, color: 'var(--ink50)', fontSize: 'var(--fs-aux)' }}>
        {t('common.loading')}
      </div>
    )
  }
  if (claims.error) {
    return (
      <div style={{ padding: 32, color: 'var(--crit-ink)', fontSize: 'var(--fs-aux)' }}>
        {claims.error.message}
      </div>
    )
  }

  const visible = filtered.slice(0, shown)

  return (
    <div style={{ padding: '28px 28px 48px', maxWidth: 1100, margin: '0 auto' }}>
      <SectionHead eyebrow={t('declaraciones.eyebrow')} title={t('declaraciones.title')} />
      <p
        style={{
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink50)',
          lineHeight: 1.55,
          maxWidth: 780,
          marginTop: 4,
          marginBottom: 10,
        }}
      >
        {t('declaraciones.subtitle')}
      </p>
      <div style={{ marginBottom: 18 }}>
        <DataAsOf iso={claims.data?.generatedAt} label="Declaraciones" />
      </div>

      {/* Stats strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: 8,
          marginBottom: 16,
        }}
      >
        <MiniStat label={t('declaraciones.stat.total')} value={stats.total} />
        {/* Sin verde: el agregado incluye las contradichas, y en verde se leía como respaldo.
            Las cifras de cada veredicto, al lado, conservan su tono. */}
        <MiniStat label={t('declaraciones.stat.conEvidencia')} value={stats.withEvidence} />
        <MiniStat label="verificado" value={stats.byVerdict.verificado} tone="ok" />
        <MiniStat label="parcial" value={stats.byVerdict.parcial} tone="warn" />
        <MiniStat label="contradicho" value={stats.byVerdict.contradicho} tone="crit" />
        <MiniStat label="sin-datos" value={stats.byVerdict['sin-datos']} />
      </div>

      {/*
        «sin-datos» contestaba tres preguntas distintas con el mismo número, y un
        hueco leído como un cero es el defecto que este repositorio ya pagó dos
        veces. El reparto va en prosa y no en tres tarjetas más porque lo que hay
        que entender no es la cifra: es que sólo la primera habla de la
        declaración, y las otras dos, de nosotros.
      */}
      {stats.byVerdict['sin-datos'] > 0 && (
        <p
          style={{
            fontSize: 'var(--fs-meta)',
            color: 'var(--ink70)',
            margin: '0 0 16px',
            maxWidth: '68ch',
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: 'var(--ink)' }}>{t('declaraciones.split.titulo')}.</strong>{' '}
          <span className="mono">
            {stats.sinDatosPorque.comprobadoSinHallar.toLocaleString('es-ES')}
          </span>{' '}
          {t('declaraciones.split.comprobadoSinHallar')} ·{' '}
          <span className="mono">{stats.sinDatosPorque.sinCorpus.toLocaleString('es-ES')}</span>{' '}
          {t('declaraciones.split.sinCorpus')} ·{' '}
          <span className="mono">{stats.sinDatosPorque.noConsta.toLocaleString('es-ES')}</span>{' '}
          {t('declaraciones.split.noConsta')}. {t('declaraciones.split.cuerpo')}
        </p>
      )}

      {/* Filter strips */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          marginBottom: 14,
          padding: 10,
          border: '1px solid var(--border2)',
          borderRadius: 'var(--r-input)',
          background: 'var(--soft)',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              color: 'var(--ink50)',
              textTransform: 'uppercase',
              letterSpacing: '.08em',
              marginRight: 4,
            }}
          >
            {t('declaraciones.filter.verdict')}:
          </span>
          <FilterChip
            active={verdictFilter === 'with-evidence'}
            label={t('declaraciones.filter.conEvidencia')}
            count={stats.withEvidence}
            onClick={() => setVerdictFilter('with-evidence')}
          />
          <FilterChip
            active={verdictFilter === 'all'}
            label={t('declaraciones.filter.todas')}
            count={stats.total}
            onClick={() => setVerdictFilter('all')}
          />
          {ALL_VERDICTS.map((v) => (
            <FilterChip
              key={v}
              active={verdictFilter === v}
              label={VERDICT_LABEL[v] ?? v}
              count={stats.byVerdict[v] ?? 0}
              onClick={() => setVerdictFilter(v)}
              tone={VERDICT_TONE[v]}
            />
          ))}
          {/* Afinan «sin-datos», así que van detrás de él y no en su propia fila. */}
          <FilterChip
            active={verdictFilter === 'comprobado-sin-hallar'}
            label={t('declaraciones.filter.comprobadoSinHallar')}
            count={stats.sinDatosPorque.comprobadoSinHallar}
            onClick={() => setVerdictFilter('comprobado-sin-hallar')}
          />
          <FilterChip
            active={verdictFilter === 'sin-corpus'}
            label={t('declaraciones.filter.sinCorpus')}
            count={stats.sinDatosPorque.sinCorpus}
            onClick={() => setVerdictFilter('sin-corpus')}
          />
          <FilterChip
            active={verdictFilter === 'no-consta'}
            label={t('declaraciones.filter.noConsta')}
            count={stats.sinDatosPorque.noConsta}
            onClick={() => setVerdictFilter('no-consta')}
          />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              color: 'var(--ink50)',
              textTransform: 'uppercase',
              letterSpacing: '.08em',
              marginRight: 4,
            }}
          >
            {t('declaraciones.filter.bloc')}:
          </span>
          <FilterChip
            active={blocFilter === 'all'}
            label={t('declaraciones.filter.todos')}
            count={stats.total}
            onClick={() => setBlocFilter('all')}
          />
          <FilterChip
            active={blocFilter === 'attributed'}
            label={t('declaraciones.filter.atribuidas')}
            count={stats.total - (stats.byBloc.null ?? 0)}
            onClick={() => setBlocFilter('attributed')}
          />
          {/* Un botón por grupo que de verdad lleva declaraciones. Un grupo sin
              ninguna no tiene nada que filtrar, y su «0» se leería como que no
              habló: el de un grupo de un escaño es una política, no un dato. */}
          {ALL_BLOCS.filter((b) => b !== null && (stats.byBloc[b] ?? 0) > 0).map((b) => (
            <FilterChip
              key={b}
              active={blocFilter === b}
              label={b}
              count={stats.byBloc[b] ?? 0}
              onClick={() => setBlocFilter(b)}
            />
          ))}
        </div>
        {unEscanoSinBoton.length > 0 && (
          <p style={{ margin: 0, fontSize: 'var(--fs-aux)', color: 'var(--ink70)' }}>
            {t(
              unEscanoSinBoton.length === 1
                ? 'declaraciones.filter.unEscano.uno'
                : 'declaraciones.filter.unEscano.varios',
            ).replace(
              '{gruposUnEscano}',
              new Intl.ListFormat(locale === 'ca' ? 'ca' : 'es', { type: 'conjunction' }).format(
                unEscanoSinBoton,
              ),
            )}{' '}
            <Link to="/metodologia#verificacion-declaraciones" style={{ color: 'var(--civic)' }}>
              {t('declaraciones.filter.unEscano.porQue')}
            </Link>
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              color: 'var(--ink50)',
              textTransform: 'uppercase',
              letterSpacing: '.08em',
              marginRight: 4,
            }}
          >
            {t('declaraciones.filter.topic')}:
          </span>
          <FilterChip
            active={topicFilter === 'all'}
            label={t('declaraciones.filter.todos')}
            onClick={() => setTopicFilter('all')}
          />
          {stats.topics.map((tp) => (
            <FilterChip
              key={tp}
              active={topicFilter === tp}
              label={tp}
              onClick={() => setTopicFilter(tp)}
            />
          ))}
        </div>
        <div style={{ marginTop: 4 }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('declaraciones.search.placeholder')}
            style={{
              width: '100%',
              padding: '6px 10px',
              borderRadius: 'var(--r-input)',
              border: '1px solid var(--border2)',
              background: 'var(--paper)',
              color: 'var(--ink)',
              fontSize: 'var(--fs-meta)',
            }}
          />
        </div>
      </div>

      <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)', marginBottom: 8 }}>
        {filtered.length.toLocaleString('es-ES')} {t('declaraciones.matchCount')}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visible.map((it) => (
          <ClaimRow key={it.claim.id} item={it} plenoTitle={plenoIndex.get(it.claim.plenoId)} />
        ))}
      </div>

      {filtered.length > shown && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button
            onClick={() => setShown((n) => n + PAGE_SIZE)}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--r-input)',
              border: '1px solid var(--border2)',
              background: 'var(--soft)',
              color: 'var(--ink)',
              fontSize: 'var(--fs-meta)',
              cursor: 'pointer',
            }}
          >
            {t('declaraciones.loadMore')} (
            {Math.min(PAGE_SIZE, filtered.length - shown).toLocaleString('es-ES')})
          </button>
        </div>
      )}
      {filtered.length === 0 && (
        <Card>
          <div
            style={{
              padding: 16,
              textAlign: 'center',
              color: 'var(--ink50)',
              fontSize: 'var(--fs-aux)',
            }}
          >
            {t('declaraciones.empty')}
          </div>
        </Card>
      )}
    </div>
  )
}
