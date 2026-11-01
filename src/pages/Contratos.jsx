import { Link } from 'react-router-dom'
import { Card, ExtLink, Marcado, Pill, SectionHead } from '../components/Primitives'
import DataAsOf from '../components/DataAsOf'
import { useObras } from '../hooks/useObras'
import { useBdns } from '../hooks/useBdns'
import { useTenders } from '../hooks/useTenders'
import { useTendersTed } from '../hooks/useTendersTed'
import { enBreveContratos } from '../scraper/en-breve-contratos'
import {
  resumenMenores,
  TECHO_MENOR_SIN_IVA,
  NORMA_MENOR,
  pesoDelMayor,
} from '../scraper/contratos-menores'
import {
  isCommittedContract,
  committedAwardYearSpan,
  importeAdjudicado,
} from '../lib/contract-status'
import { decimal, entero, euros, eurosBreves, fmtDateCompacta, rellena } from '../lib/formatters'
import { conHuecos } from '../lib/huecos'
import { yearSpan } from '../lib/year-span'
import { EFICIENCIA_ENABLED } from '../flags'
import { useLocale, useT } from '../i18n'
import Paginacion from '../components/Paginacion'
import GastoDashboard from '../components/Presupuesto/GastoDashboard'
import EnBreveContratos from '../components/Contratos/EnBreveContratos'
import DivisorLecturas from '../components/DivisorLecturas'
import { SeccionExperta } from '../components/Lecturas'
import { TedNotices } from '../components/Presupuesto/TedNotices'

/*
 * /contratos: lo que el Ayuntamiento contrata, a quién y cuánto sin concurso.
 *
 * Vivía debajo de /presupuesto, y eran dos páginas en una: el presupuesto se
 * aprueba y se ejecuta cada año, la contratación se acumula a lo largo de varios
 * ejercicios, y la propia página gastaba un párrafo en decir que aquellos
 * recuentos no eran el reparto del presupuesto de arriba. Tampoco había nada que
 * pulsar para quien buscara «contratos» (auditoría de las dos lecturas, §5). Las
 * anclas viejas se reenvían (`scraper/ruta-de-contratos`).
 *
 * Las secciones se mudaron tal cual, con sus claves `presupuesto.*` y sus
 * componentes en `components/Presupuesto/`: renombrarlos habría escondido en el
 * mismo cambio que ni una frase se movió sola.
 *
 * El orden: primero las cuatro tarjetas, que son el índice de la página; luego
 * el mapa y el listado, que son lo que se viene a buscar; y debajo el detalle de
 * cada recuento.
 */

/** Las obras van de diez en diez, igual que el listado de contratos. */
const POR_PAGINA_OBRAS = 10

const pct1 = (n) =>
  n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const pct0 = (n) => Math.round(n).toLocaleString('es-ES')
const num = (n) => Number(n).toLocaleString('es-ES')

const EYEBROW = {
  fontSize: 'var(--fs-micro)',
  color: 'var(--ink50)',
  textTransform: 'uppercase',
  letterSpacing: '.08em',
}

function Cabecera() {
  const t = useT()
  const { data } = useTenders()
  return (
    <div>
      <div className="mono" style={EYEBROW}>
        {t('presupuesto.contra.eyebrow')}
      </div>
      <h1
        style={{
          fontSize: 'var(--fs-page)',
          fontWeight: 700,
          letterSpacing: '-.02em',
          margin: '6px 0 0',
          lineHeight: 1.15,
        }}
      >
        {t('nav.contratos')}
      </h1>
      <p
        style={{
          margin: '8px 0 10px',
          fontSize: 'var(--fs-body)',
          lineHeight: 1.5,
          color: 'var(--ink70)',
          maxWidth: '68ch',
        }}
      >
        {t('contratos.entradilla')}
      </p>
      <DataAsOf iso={data?.generatedAt} file="tenders.json" />
    </div>
  )
}

/* ------------------------------------------------------------------------ */
/* Contratación: cuatro tarjetas-resumen y, debajo, sus fichas enteras         */
/* ------------------------------------------------------------------------ */

function TarjetaContratacion({ href, eyebrow, cifra, nota, enlace }) {
  return (
    <a
      href={href}
      className="cp-card"
      data-tarjeta=""
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        color: 'inherit',
        textDecoration: 'none',
        padding: 16,
      }}
    >
      <div className="mono" style={{ ...EYEBROW, letterSpacing: '.07em' }}>
        {eyebrow}
      </div>
      <div
        className="mono"
        style={{ fontSize: 'var(--fs-card)', fontWeight: 500, letterSpacing: '-.01em' }}
      >
        {cifra}
      </div>
      <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink70)', lineHeight: 1.45 }}>
        {nota}
      </div>
      <div
        style={{
          fontSize: 'var(--fs-meta)',
          color: 'var(--civic)',
          marginTop: 'auto',
          paddingTop: 6,
          fontWeight: 500,
        }}
      >
        {enlace}
      </div>
    </a>
  )
}

/** Los cuatro recuentos, con los MISMOS predicados que las fichas de abajo. */
function ContratacionBanda() {
  const t = useT()
  const { data: tenders } = useTenders()
  const { data: obrasData } = useObras()
  const { data: ted } = useTendersTed()
  const { data: bdns } = useBdns()

  const contratos = tenders?.contracts ?? []
  const r = contratos.length > 0 ? resumenMenores(contratos) : null
  const adjudicados = contratos.filter((c) => isCommittedContract(c))
  const totalNeto = adjudicados.map((c) => importeAdjudicado(c) ?? 0).reduce((a, b) => a + b, 0)

  const obras = obrasData?.obras ?? []
  const renove = obras.filter((o) => o.programa === 'renove').length
  // Cada recuento dice EL PERIODO QUE ABARCA, derivado de sus propias filas.
  // Sin él, cuatro cifras acumuladas sobre varios ejercicios se leen como el
  // reparto de un presupuesto anual — que es exactamente lo que la revisión
  // lectora señaló de la frase de entrada.
  //
  // Las obras NO llevan periodo, y es a propósito: sólo las siete del Plan
  // RENOVE traen `fechaEjecucion`; las siete del FEDER la traen a `null`. Un
  // `yearSpan` sobre esa columna devuelve 2023–2024 con toda la confianza del
  // mundo, y eso describiría la MITAD de las fichas que la tarjeta cuenta.
  // Es la regla de `year-span.js` —el periodo se mide sobre exactamente las
  // filas que la cifra cuenta— con el error del lado corto. Las otras tres
  // fechan el 99,3 %, el 100 % y el 100 % de sus filas.
  const spanBdns = yearSpan(
    (bdns?.items ?? []).filter((i) => i.direction === 'granted').map((i) => i.date),
  )
  // Lo recibido se cuenta en CONCESIONES y en euros concedidos, no en
  // convocatorias: una convocatoria de la Diputación da ocho concesiones al
  // Ayuntamiento. Antes la nota sumaba las recibidas a las municipales en un
  // «{total} en total» que contaba convocatorias de dos poblaciones distintas.
  const concBdns = bdns?.stats?.concesiones
  const spanConc = yearSpan((bdns?.concesiones ?? []).map((c) => c.fecha))
  const rangoMenores = committedAwardYearSpan(contratos)
  const spanMenores = rangoMenores
    ? rangoMenores.from === rangoMenores.to
      ? String(rangoMenores.from)
      : `${rangoMenores.from}–${rangoMenores.to}`
    : null

  const anuncios = ted?.items ?? []
  const valorados = anuncios.filter((i) => i.totalValueEur)
  const totalTed = valorados.reduce((s, i) => s + i.totalValueEur, 0)
  const mayorTed = valorados.reduce(
    (a, b) => (b.totalValueEur > (a?.totalValueEur ?? 0) ? b : a),
    null,
  )
  const cuotaMayor = totalTed > 0 && mayorTed ? mayorTed.totalValueEur / totalTed : 0
  const spanTed = yearSpan(anuncios.map((i) => i.publicationDate))

  const tarjetas = []
  if (r && r.n > 0 && adjudicados.length > 0) {
    tarjetas.push({
      href: '#menores',
      eyebrow: t('presupuesto.contra.menores'),
      cifra: num(r.n),
      nota: rellena(t('presupuesto.contra.menores.nota'), {
        span: spanMenores ? ` ${spanMenores}` : '',
        adj: num(adjudicados.length),
        importe: eurosBreves(r.importeSinIva),
        pctN: pct0((r.n / adjudicados.length) * 100),
        pctImporte: totalNeto > 0 ? pct1((r.importeSinIva / totalNeto) * 100) : '—',
      }),
      enlace: t('presupuesto.contra.menores.link'),
    })
  }
  if (obras.length > 0) {
    tarjetas.push({
      href: '#obras',
      eyebrow: t('presupuesto.contra.obras'),
      cifra: num(obras.length),
      nota: rellena(t('presupuesto.contra.obras.nota'), {
        renove,
        feder: obras.length - renove,
      }),
      enlace: t('presupuesto.contra.obras.link'),
    })
  }
  if (anuncios.length > 0) {
    tarjetas.push({
      href: '#ted',
      eyebrow: t('presupuesto.contra.ted'),
      cifra: num(anuncios.length),
      nota:
        rellena(t('presupuesto.contra.ted.nota'), {
          span: spanTed ? ` ${spanTed}` : '',
          valued: num(valorados.length),
          total: eurosBreves(totalTed),
        }) +
        (cuotaMayor >= 0.25
          ? rellena(t('presupuesto.contra.ted.mayor'), { pct: pct0(cuotaMayor * 100) })
          : ''),
      enlace: t('presupuesto.contra.ted.link'),
    })
  }
  if (bdns?.stats?.granted > 0) {
    tarjetas.push({
      href: '#subvenciones',
      eyebrow: t('presupuesto.contra.bdns'),
      cifra: num(bdns.stats.granted),
      nota:
        rellena(t('presupuesto.contra.bdns.nota'), { span: spanBdns ? ` ${spanBdns}` : '' }) +
        (concBdns?.total > 0
          ? rellena(t('presupuesto.contra.bdns.recibidas'), {
              n: num(concBdns.total),
              span: spanConc ? ` ${spanConc}` : '',
              importe: eurosBreves(concBdns.importe),
            })
          : ''),
      enlace: t('presupuesto.contra.bdns.link'),
    })
  }
  if (tarjetas.length === 0) return null

  return (
    <div>
      <SectionHead
        eyebrow={t('presupuesto.contra.eyebrow')}
        title={t('presupuesto.contra.title')}
        size="head"
      />
      <p
        style={{
          margin: '0 0 14px',
          fontSize: 'var(--fs-aux)',
          lineHeight: 1.55,
          color: 'var(--ink70)',
          maxWidth: '92ch',
        }}
      >
        <Marcado texto={t('presupuesto.contra.intro')} />
      </p>
      <div className="cp-presu-contra">
        {tarjetas.map((c) => (
          <TarjetaContratacion key={c.href} {...c} />
        ))}
      </div>
    </div>
  )
}

function RealSubsidies() {
  const { locale, t } = useLocale()
  const { loading, error, data } = useBdns()
  if (loading || error || !data) return null
  const items = (data.items || []).filter((i) => i.direction === 'granted').slice(0, 6)
  if (items.length === 0) return null
  const conc = data.stats?.concesiones
  const concesiones = (data.concesiones || []).slice(0, 5)
  const spanConc = yearSpan((data.concesiones || []).map((c) => c.fecha))
  return (
    <Card id="subvenciones" style={{ scrollMarginTop: 24 }}>
      <SectionHead
        eyebrow={
          rellena(t('presupuesto.subvenciones.eyebrow'), { municipales: num(data.stats.granted) }) +
          (conc?.total > 0
            ? rellena(t('presupuesto.subvenciones.eyebrow.recibidas'), { n: num(conc.total) })
            : '')
        }
        title={t('presupuesto.subvenciones.titulo')}
      />
      <div
        style={{
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          marginTop: 2,
          marginBottom: 10,
        }}
      >
        {t('presupuesto.subvenciones.fuente')}
      </div>
      {items.map((s, i) => (
        <div
          key={s.bdnsCode}
          style={{
            padding: '10px 0',
            borderBottom: i === items.length - 1 ? 'none' : '1px solid var(--border2)',
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 2 }}>
            <Pill tone="civic" size="xs">
              BDNS {s.bdnsCode}
            </Pill>
            <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
              {fmtDateCompacta(s.date, locale)}
            </span>
          </div>
          <div style={{ fontSize: 'var(--fs-aux)', lineHeight: 1.4 }}>
            <ExtLink href={s.sourceUrl} style={{ color: 'inherit', textDecoration: 'none' }}>
              {s.description.length > 180 ? s.description.slice(0, 180) + '…' : s.description}
            </ExtLink>
          </div>
        </div>
      ))}
      {conc?.total > 0 && concesiones.length > 0 && (
        <div style={{ marginTop: 18 }} data-bdns-recibidas>
          <div style={EYEBROW}>{t('presupuesto.subvenciones.recibidas.titulo')}</div>
          <p
            style={{
              fontSize: 'var(--fs-aux)',
              lineHeight: 1.5,
              color: 'var(--ink70)',
              margin: '4px 0 6px',
              maxWidth: '68ch',
            }}
          >
            {rellena(t('presupuesto.subvenciones.recibidas.texto'), {
              n: num(conc.total),
              span: spanConc ? ` ${spanConc}` : '',
              conv: num(conc.convocatorias),
              importe: eurosBreves(conc.importe),
              desde: conc.desde ? conc.desde.slice(0, 4) : '—',
            })}
          </p>
          {concesiones.map((c, i) => (
            <div
              key={c.id}
              style={{
                padding: '10px 0',
                borderBottom: i === concesiones.length - 1 ? 'none' : '1px solid var(--border2)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'baseline',
                  flexWrap: 'wrap',
                  marginBottom: 2,
                }}
              >
                <span className="mono" style={{ fontSize: 'var(--fs-aux)', fontWeight: 600 }}>
                  {typeof c.importe === 'number' ? euros(c.importe) : '—'}
                </span>
                <span
                  className="mono"
                  style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}
                >
                  {fmtDateCompacta(c.fecha, locale)} · BDNS {c.bdnsCode}
                </span>
              </div>
              <div style={{ fontSize: 'var(--fs-aux)', lineHeight: 1.4 }}>
                <ExtLink href={c.sourceUrl} style={{ color: 'inherit', textDecoration: 'none' }}>
                  {c.convocatoria.length > 180
                    ? c.convocatoria.slice(0, 180) + '…'
                    : c.convocatoria}
                </ExtLink>
              </div>
              <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 2 }}>
                {c.organ}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function ObrasEnCursoSection() {
  const t = useT()
  const { data } = useObras()
  const obras = data?.obras ?? []
  if (obras.length === 0) return null
  const eur = (n) => (typeof n === 'number' ? euros(n) : '—')
  const renove = obras.filter((o) => o.programa === 'renove')
  const feder = obras.filter((o) => o.programa !== 'renove')
  return (
    <Card id="obras" style={{ scrollMarginTop: 24 }}>
      <SectionHead eyebrow={t('presupuesto.obras.eyebrow')} title={t('presupuesto.obras.titulo')} />
      <p
        style={{
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink50)',
          margin: '2px 0 8px',
          maxWidth: '68ch',
        }}
      >
        {renove.length > 0
          ? rellena(t('presupuesto.obras.intro'), {
              n: obras.length,
              renove: renove.length,
              feder: feder.length,
            })
          : rellena(t('presupuesto.obras.intro.soloFeder'), {
              n: obras.length,
              feder: feder.length,
            })}
      </p>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          margin: '0 0 14px',
          flexWrap: 'wrap',
        }}
      >
        <Pill tone="warn">{t('presupuesto.obras.ultimas')}</Pill>
        <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>
          {t('presupuesto.obras.ejecutadas')}
        </span>
      </div>
      {/* Catorce fichas de obra seguidas medían más de 1.800 px y dejaban la
          sección siguiente fuera de la pantalla. Se paginan con el mismo
          componente que el listado de contratos: una sola implementación del
          acotado, del reinicio y de los botones. */}
      <Paginacion
        items={obras}
        porPagina={POR_PAGINA_OBRAS}
        etiqueta={t('presupuesto.obras.listado')}
      >
        {(pagina) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pagina.map((o) => {
              const importe = o.importeAdjudicacion ?? o.costePrevisto
              const importeLabel =
                o.importeAdjudicacion != null
                  ? t('presupuesto.obras.adj')
                  : t('presupuesto.obras.previsto')
              return (
                <div
                  key={o.id}
                  style={{ paddingBottom: 10, borderBottom: '1px solid var(--border2)' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      gap: 10,
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{o.nombre}</span>
                    <span style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                      <Pill tone="neutral">
                        {o.programa === 'renove' ? t('presupuesto.obras.renove') : 'FEDER'}
                      </Pill>
                      {typeof o.bajaPct === 'number' && (
                        <Pill tone={o.bajaPct >= 20 ? 'ok' : 'neutral'}>
                          {t('presupuesto.obras.baja')} <span className="mono">{o.bajaPct}%</span>
                        </Pill>
                      )}
                    </span>
                  </div>
                  <div
                    className="mono"
                    style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 3 }}
                  >
                    {o.empresa ? `${o.empresa} · ` : ''}
                    {importe != null ? `${eur(importe)} ${importeLabel}` : ''}
                    {o.plazoMeses
                      ? ` · ${rellena(t('presupuesto.obras.meses'), { n: o.plazoMeses })}`
                      : ''}
                    {o.inicio
                      ? ` · ${rellena(t('presupuesto.obras.inicio'), { fecha: o.inicio })}`
                      : ''}
                    {o.fechaEjecucion
                      ? ` · ${rellena(t('presupuesto.obras.ejecucion'), { fecha: o.fechaEjecucion })}`
                      : ''}
                  </div>
                  <a
                    href={o.fichaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mono"
                    style={{
                      fontSize: 'var(--fs-micro)',
                      color: 'var(--civic)',
                      textDecoration: 'underline',
                    }}
                  >
                    {t('presupuesto.obras.verFicha')}
                  </a>
                </div>
              )
            })}
          </div>
        )}
      </Paginacion>
      <p
        style={{
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink50)',
          marginTop: 10,
          marginBottom: 0,
        }}
      >
        {t('presupuesto.obras.fuente')}
      </p>
    </Card>
  )
}

/**
 * La contratación menor: lo que se adjudica sin concurso.
 *
 * El dato llevaba ahí desde siempre —`minorContract`, leído de ribalicita— y no
 * lo enseñaba nadie: ni un fichero del front nombraba el campo. El portal del
 * Ayuntamiento se compromete a publicar estos contratos «como mínimo
 * trimestralmente», así que la pregunta que contesta esta tarjeta es la que el
 * propio compromiso invita a hacer.
 *
 * Todo se mide SIN IVA, que es como define el techo el art. 118. Con los
 * importes brutos salían quince contratos por encima del límite y son cuatro.
 */
function ContratacionMenorSection() {
  const t = useT()
  const { data } = useTenders()
  const contratos = data?.contracts ?? []
  if (contratos.length === 0) return null
  const r = resumenMenores(contratos)
  if (r.n === 0) return null

  const eur = euros
  // El denominador son los ADJUDICADOS, no las filas del snapshot: de las 809
  // hay 108 anuladas, revocadas, desistidas o sin clasificar. Compararse con
  // ellas diluye el peso de la vía directa —23 % en vez del 26 % real— y lo
  // cazó la revisión lectora antes de que esto se publicara.
  const adjudicados = contratos.filter((c) => isCommittedContract(c))
  const totalNeto = adjudicados.map((c) => importeAdjudicado(c) ?? 0).reduce((a, b) => a + b, 0)
  const cuota = totalNeto > 0 ? (r.importeSinIva / totalNeto) * 100 : null
  // El total lo domina una sola concesión adjudicada de una vez por todo su
  // plazo, así que «2,5 % del importe» dicho solo tranquiliza más de lo que el
  // dato sostiene. Derivado, nunca escrito: una concesión nueva lo mueve.
  const peso = pesoDelMayor(
    adjudicados.map((c) => importeAdjudicado(c) ?? 0),
    r.importeSinIva,
  )
  const topeAnio = Math.max(...r.porAnio.map((a) => a.n), 1)

  return (
    <Card id="menores" style={{ scrollMarginTop: 24 }}>
      <SectionHead
        eyebrow={t('presupuesto.menores.eyebrow')}
        title={rellena(t('presupuesto.menores.titulo'), {
          n: r.n,
          total: adjudicados.length,
          importe: eur(r.importeSinIva),
        })}
      />
      <p
        style={{
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink50)',
          margin: '2px 0 12px',
          maxWidth: '68ch',
        }}
      >
        {conHuecos(t('presupuesto.menores.intro'), {
          '{sinLicitacion}': <strong>{t('presupuesto.menores.intro.sinLicitacion')}</strong>,
          '{pct}': Math.round((r.n / adjudicados.length) * 100),
          '{importe}':
            cuota != null
              ? ` ${rellena(t('presupuesto.menores.intro.importe'), { pct: decimal(cuota) })}`
              : '',
        })}{' '}
        {peso && (
          <>
            {rellena(t('presupuesto.menores.peso'), {
              importe: eur(peso.importeDelMayor),
              cuota: peso.cuotaDelMayor,
              // `cuotaSinElMayor` trae un decimal, y `String(4.5)` lo escribe
              // con punto: el mismo defecto que la frase de arriba, una línea
              // después.
              sin: decimal(peso.cuotaSinElMayor),
            })}{' '}
          </>
        )}
        {conHuecos(t('presupuesto.menores.iva'), {
          '{sinIva}': <strong>{t('presupuesto.menores.iva.sinIva')}</strong>,
          '{obras}': eur(TECHO_MENOR_SIN_IVA.construction),
          '{servicios}': eur(TECHO_MENOR_SIN_IVA.services),
        })}
      </p>

      <div style={{ display: 'grid', gap: 5, margin: '0 0 12px' }}>
        {r.porAnio.map((a) => (
          <div key={a.anio} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              className="mono"
              style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)', width: 40 }}
            >
              {a.anio}
            </span>
            <div
              style={{
                flex: 1,
                height: 12,
                background: 'var(--civic-soft)',
                borderRadius: 'var(--r-pill)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${(a.n / topeAnio) * 100}%`,
                  height: '100%',
                  background: 'var(--civic)',
                }}
              />
            </div>
            <span
              className="mono"
              style={{ fontSize: 'var(--fs-meta)', width: 118, textAlign: 'right' }}
            >
              {a.n} · {eur(a.importeSinIva)}
            </span>
          </div>
        ))}
      </div>

      {r.sobreTecho.length > 0 && (
        <div style={{ margin: '0 0 10px' }}>
          <Pill tone="warn">
            {rellena(t('presupuesto.menores.sobreTecho'), { n: r.sobreTecho.length })}
          </Pill>
          <ul
            style={{
              margin: '8px 0 0',
              paddingLeft: 18,
              fontSize: 'var(--fs-meta)',
              color: 'var(--ink70)',
            }}
          >
            {r.sobreTecho.map((c) => (
              <li key={c.title} style={{ marginBottom: 3 }}>
                <span className="mono">{eur(c.importeSinIva)}</span>{' '}
                {t('presupuesto.menores.frente')} <span className="mono">{eur(c.techo)}</span> —{' '}
                {c.title}
              </li>
            ))}
          </ul>
          <p
            style={{
              fontSize: 'var(--fs-meta)',
              color: 'var(--ink50)',
              margin: '8px 0 0',
              maxWidth: '68ch',
            }}
          >
            {t('presupuesto.menores.marca')}
          </p>
        </div>
      )}

      {(r.sinTecho > 0 || r.sinImporte > 0) && (
        <p style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)', margin: '0 0 8px' }}>
          {rellena(t('presupuesto.menores.sinComparar'), {
            lista: [
              r.sinTecho > 0 && rellena(t('presupuesto.menores.sinTecho'), { n: r.sinTecho }),
              r.sinImporte > 0 && rellena(t('presupuesto.menores.sinImporte'), { n: r.sinImporte }),
            ]
              .filter(Boolean)
              .join(' · '),
          })}
          {r.anulados > 0 && ` ${rellena(t('presupuesto.menores.anulados'), { n: r.anulados })}`}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <DataAsOf iso={data?.generatedAt} file="tenders.json" />
        <ExtLink href={NORMA_MENOR}>{t('presupuesto.menores.norma')}</ExtLink>
      </div>
    </Card>
  )
}

/**
 * Lo que demuestra «¿Cuánto se adjudica sin concurso?». Es el criterio del
 * indicador de /gestion, partido en lo que lo compone: la tarjeta de los menores
 * sólo enseña una de las dos vías, y la mitad larga de la otra son contratos de
 * emergencia tras la DANA, que no es lo que un lector entiende por negociar.
 */
function SinConvocatoriaSection() {
  const t = useT()
  const { data } = useTenders()
  const s = enBreveContratos({ tenders: data }).sinConcurso
  if (!s) return null
  const filas = [
    ['menores', t('contratos.sinConvocatoria.menores'), s.menores, s.importeMenores],
    ['negociados', t('contratos.sinConvocatoria.negociados'), s.negociados, s.importeNegociados],
    ...(s.negociadosDana > 0
      ? [['dana', t('contratos.sinConvocatoria.dana'), s.negociadosDana, s.importeNegociadosDana]]
      : []),
    ['total', t('contratos.sinConvocatoria.total'), s.n, s.importe],
    ['todos', t('contratos.sinConvocatoria.todos'), s.de, s.importeTotal],
  ]
  const celda = { padding: '7px 0', borderTop: '1px solid var(--border2)' }
  return (
    <Card id="sin-convocatoria" style={{ scrollMarginTop: 24 }}>
      <SectionHead
        eyebrow={t('presupuesto.contra.eyebrow')}
        title={rellena(t('contratos.sinConvocatoria.titulo'), { n: entero(s.n), de: entero(s.de) })}
      />
      <p
        style={{
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink50)',
          margin: '2px 0 12px',
          maxWidth: '68ch',
        }}
      >
        {t('contratos.sinConvocatoria.intro')}
      </p>
      <table
        style={{
          width: '100%',
          maxWidth: 560,
          borderCollapse: 'collapse',
          fontSize: 'var(--fs-aux)',
        }}
      >
        <thead>
          <tr style={{ color: 'var(--ink50)', fontSize: 'var(--fs-meta)' }}>
            <th scope="col" style={{ textAlign: 'left', fontWeight: 500, paddingBottom: 6 }}>
              {t('contratos.sinConvocatoria.via')}
            </th>
            <th scope="col" style={{ textAlign: 'right', fontWeight: 500, paddingBottom: 6 }}>
              {t('contratos.sinConvocatoria.contratos')}
            </th>
            <th scope="col" style={{ textAlign: 'right', fontWeight: 500, paddingBottom: 6 }}>
              {t('contratos.sinConvocatoria.importe')}
            </th>
          </tr>
        </thead>
        <tbody>
          {filas.map(([id, rotulo, n, importe]) => (
            <tr key={id} data-fila-sin-convocatoria={id}>
              <th
                scope="row"
                style={{
                  ...celda,
                  textAlign: 'left',
                  fontWeight: id === 'total' ? 700 : 400,
                  paddingLeft: id === 'dana' ? 14 : 0,
                  color: id === 'dana' || id === 'todos' ? 'var(--ink50)' : 'inherit',
                }}
              >
                {rotulo}
              </th>
              <td className="mono" style={{ ...celda, textAlign: 'right' }}>
                {entero(n)}
              </td>
              <td className="mono" style={{ ...celda, textAlign: 'right' }}>
                {euros(importe)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p
        style={{
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink70)',
          margin: '12px 0 0',
          maxWidth: '68ch',
        }}
      >
        {rellena(t('contratos.sinConvocatoria.cuota'), { n: s.deCada100 })}{' '}
        {s.importePct == null
          ? ''
          : s.importeSinElMayorPct == null
            ? rellena(t('contratos.enBreve.sinConcurso.importe'), { pct: decimal(s.importePct) })
            : rellena(t('contratos.enBreve.sinConcurso.importeSinElMayor'), {
                pct: decimal(s.importePct),
                sin: decimal(s.importeSinElMayorPct),
              })}
      </p>
      {/* Detrás del mismo interruptor que la registra en el router. */}
      {EFICIENCIA_ENABLED && (
        <p style={{ fontSize: 'var(--fs-aux)', margin: '8px 0 0', maxWidth: '68ch' }}>
          {t('contratos.sinConvocatoria.competencia')}{' '}
          <Link to="/gestion" style={{ color: 'var(--civic)' }}>
            {t('contratos.sinConvocatoria.gestion')}
          </Link>
        </p>
      )}
    </Card>
  )
}

function PieContratos() {
  const t = useT()
  return (
    <div
      style={{
        borderTop: '1px solid var(--border)',
        paddingTop: 18,
        display: 'flex',
        gap: 16,
        flexWrap: 'wrap',
        fontSize: 'var(--fs-aux)',
      }}
    >
      <Link to="/presupuesto" style={{ color: 'var(--civic)' }}>
        {t('contratos.pie.presupuesto')}
      </Link>
      {/* Detrás del mismo interruptor que la registra en el router: con el flag
          apagado /gestion cae al comodín y dejaría al lector en la portada. */}
      {EFICIENCIA_ENABLED && (
        <Link to="/gestion" style={{ color: 'var(--civic)' }}>
          {t('contratos.pie.gestion')}
        </Link>
      )}
      <Link to="/datos" style={{ color: 'var(--civic)' }}>
        {t('presupuesto.pie.datos')}
      </Link>
      <Link to="/metodologia#grupo-datos" style={{ color: 'var(--civic)' }}>
        {t('presupuesto.pie.metodologia')}
      </Link>
    </div>
  )
}

export default function Contratos() {
  const t = useT()
  return (
    <div
      className="cp-page"
      style={{
        padding: '24px 24px 48px',
        maxWidth: 1400,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      <Cabecera />
      <EnBreveContratos />
      {/* «Saltar a todos los datos» aterriza en el divisor, que es donde empiezan. */}
      <div id="todos-los-datos" style={{ scrollMarginTop: 24 }}>
        <DivisorLecturas />
      </div>
      <SeccionExperta id="contratos-recuentos" titulo={t('presupuesto.contra.title')}>
        <ContratacionBanda />
      </SeccionExperta>
      <SeccionExperta id="contratos-mapa" titulo={t('presupuesto.gasto.titulo')}>
        <GastoDashboard />
      </SeccionExperta>
      <SeccionExperta
        id="contratos-sin-convocatoria"
        titulo={t('contratos.seccion.sinConvocatoria')}
      >
        <SinConvocatoriaSection />
      </SeccionExperta>
      <SeccionExperta id="contratos-menores" titulo={t('presupuesto.seccion.menores')}>
        <ContratacionMenorSection />
      </SeccionExperta>
      <SeccionExperta id="contratos-obras" titulo={t('presupuesto.seccion.obras')}>
        <ObrasEnCursoSection />
      </SeccionExperta>
      {/* El ancla `#ted` es la propia sección: sin anuncios, su cuerpo queda
          vacío y la pestaña plegada no sale. */}
      <SeccionExperta
        id="ted"
        titulo={t('presupuesto.seccion.ted')}
        style={{ scrollMarginTop: 24 }}
      >
        <TedNotices />
      </SeccionExperta>
      <SeccionExperta id="contratos-subvenciones" titulo={t('presupuesto.subvenciones.titulo')}>
        <RealSubsidies />
      </SeccionExperta>
      <PieContratos />
    </div>
  )
}
