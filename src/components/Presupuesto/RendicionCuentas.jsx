import { Card, ExtLink, Marcado, MarcadoConHuecos, Pill, SectionHead } from '../Primitives'
import DataAsOf from '../DataAsOf'
import { useRendicionCuentas } from '../../hooks/useRendicionCuentas'
import { diaEnEspana, evaluarPlazo, PLAZOS } from '../../scraper/rendicion-cuentas'
import { entero, fmtDateCompacta, fmtDateLong, rellena } from '../../lib/formatters'
import { useLocale, useT } from '../../i18n'

/*
 * Cuándo se aprueban y se rinden las cuentas, ejercicio a ejercicio, tal como
 * el Ayuntamiento lo registra en la Plataforma de Rendición de Cuentas.
 *
 * Tres columnas y no ocho: sólo se contrastan las fechas cuyo acto tiene un
 * plazo en la ley (`PLAZOS`). La liquidación y el informe de la Comisión
 * Especial tienen plazo para OTRO acto —confeccionarla, someter la cuenta a
 * informe—, así que su fecha no prueba ni el cumplimiento ni el retraso, y
 * pintarla junto a un veredicto lo insinuaría. Están a un clic, en la página de
 * cada ejercicio en la plataforma.
 *
 * El veredicto se calcula aquí, con la fecha del día, y no en el snapshot: un
 * «plazo abierto» escrito en un fichero que nadie refresca seguiría abierto
 * después de vencer.
 *
 * Ámbar, no rojo, para lo que llega después del plazo: es la fecha que la
 * propia ley fija, pero la página no documenta qué consecuencia tuvo.
 */

const COLUMNAS = /** @type {(keyof typeof PLAZOS)[]} */ (Object.keys(PLAZOS))

// Cada clave va literal en su llamada, con su objeto: el guard del catálogo
// (tests/i18n-catalogue.test.ts) lee la llamada para saber qué huecos rellena.
function Veredicto({ ev }) {
  const t = useT()
  if (ev.veredicto === 'en-plazo') {
    return (
      <Pill tone="ok" size="xs">
        {t('presupuesto.rendicion.enPlazo')}
      </Pill>
    )
  }
  if (ev.veredicto === 'fuera-de-plazo') {
    return (
      <Pill tone="warn" size="xs">
        {ev.diasTras === 0
          ? t('presupuesto.rendicion.diaLimite')
          : ev.diasTras === 1
            ? t('presupuesto.rendicion.dia')
            : rellena(t('presupuesto.rendicion.dias'), { n: entero(ev.diasTras) })}
      </Pill>
    )
  }
  if (ev.veredicto === 'pendiente') {
    return (
      <Pill tone="neutral" size="xs">
        {t('presupuesto.rendicion.pendiente')}
      </Pill>
    )
  }
  return null
}

/** El titular: el envío de la última cuenta con página, contra su plazo. */
function titular(t, locale, fila) {
  const ev = fila.evs.enviada
  const ej = fila.ejercicio
  const fecha = fmtDateLong(fila.fechas.enviada, locale)
  const limite = fmtDateLong(ev.limite, locale)
  if (ev.veredicto === 'en-plazo') {
    return rellena(t('presupuesto.rendicion.titulo.enPlazo'), { ej, fecha, limite })
  }
  if (ev.veredicto === 'fuera-de-plazo') {
    if (ev.diasTras === 0)
      return rellena(t('presupuesto.rendicion.titulo.diaLimite'), { ej, fecha })
    if (ev.diasTras === 1) {
      return rellena(t('presupuesto.rendicion.titulo.unDia'), { ej, fecha, limite })
    }
    return rellena(t('presupuesto.rendicion.titulo.fuera'), {
      ej,
      fecha,
      limite,
      n: entero(ev.diasTras),
    })
  }
  if (ev.veredicto === 'pendiente') {
    return rellena(t('presupuesto.rendicion.titulo.pendiente'), { ej, limite })
  }
  return rellena(t('presupuesto.rendicion.titulo.sinFecha'), { ej })
}

export default function RendicionCuentas() {
  const { locale, t } = useLocale()
  const { data } = useRendicionCuentas()
  const ejercicios = (data?.ejercicios ?? [])
    .filter((e) => e.fechas)
    .sort((a, b) => b.ejercicio - a.ejercicio)
  if (ejercicios.length === 0) return null
  const hoy = diaEnEspana(new Date())

  const titulos = {
    presupuestoAprobado: t('presupuesto.rendicion.col.presupuesto'),
    cuentaAprobada: t('presupuesto.rendicion.col.pleno'),
    enviada: t('presupuesto.rendicion.col.envio'),
  }

  const filas = ejercicios.map((e) => ({
    ...e,
    evs: Object.fromEntries(
      COLUMNAS.map((c) => [c, evaluarPlazo(c, e.ejercicio, e.fechas[c] ?? null, hoy)]),
    ),
  }))
  const titulo = titular(t, locale, filas[0])

  // Con fecha publicada, ¿cuántas en plazo? El denominador deja fuera lo que
  // no tiene fecha y lo que aún no ha vencido, y la frase lo dice.
  const recuento = Object.fromEntries(
    COLUMNAS.map((c) => {
      const con = filas.filter((f) => ['en-plazo', 'fuera-de-plazo'].includes(f.evs[c].veredicto))
      return [
        c,
        { en: con.filter((f) => f.evs[c].veredicto === 'en-plazo').length, de: con.length },
      ]
    }),
  )
  const sinFecha = filas.reduce(
    (n, f) => n + COLUMNAS.filter((c) => f.evs[c].veredicto === 'sin-fecha').length,
    0,
  )

  const stats = data?.stats

  return (
    <Card id="rendicion" className="cp-rendicion-marco" style={{ scrollMarginTop: 24 }}>
      <SectionHead
        eyebrow={t('presupuesto.rendicion.eyebrow')}
        title={titulo}
        right={
          stats?.conEstado > 0 && (
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div
                className="mono"
                style={{ fontSize: 'var(--fs-card)', fontWeight: 500, letterSpacing: '-.02em' }}
              >
                {rellena(t('presupuesto.rendicion.rendidas'), {
                  a: stats.rendidas,
                  n: stats.conEstado,
                })}
              </div>
              <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 2 }}>
                {rellena(t('presupuesto.rendicion.rendidas.pie'), {
                  desde: stats.desde,
                  hasta: stats.hasta,
                })}
              </div>
            </div>
          )
        }
      />

      <div className="cp-rendicion" role="table" aria-label={t('presupuesto.rendicion.tabla')}>
        <div className="cp-rendicion-fila cp-rendicion-cabecera" role="row">
          <span role="columnheader">{t('presupuesto.rendicion.col.ejercicio')}</span>
          {COLUMNAS.map((c) => (
            <span key={c} role="columnheader">
              {titulos[c]}
            </span>
          ))}
        </div>
        {filas.map((f) => (
          <div
            key={f.ejercicio}
            className="cp-rendicion-fila"
            role="row"
            data-rendicion={f.ejercicio}
          >
            <span role="rowheader" className="mono cp-rendicion-ej">
              <ExtLink href={f.url} style={{ color: 'var(--civic)' }}>
                {f.ejercicio}
              </ExtLink>
            </span>
            {COLUMNAS.map((c) => (
              <span
                key={c}
                role="cell"
                className="cp-rendicion-celda"
                data-veredicto={f.evs[c].veredicto}
              >
                {/* La etiqueta sólo se ve cuando la fila se apila; el lector de
                    pantalla ya tiene la cabecera de columna. */}
                <span className="cp-rendicion-etq" aria-hidden="true">
                  {titulos[c]}
                </span>
                <span className="mono" style={{ whiteSpace: 'nowrap' }}>
                  {f.fechas[c] ? (
                    fmtDateCompacta(f.fechas[c], locale)
                  ) : (
                    <span style={{ color: 'var(--ink50)' }}>
                      {t('presupuesto.rendicion.sinFecha')}
                    </span>
                  )}
                </span>
                <Veredicto ev={f.evs[c]} />
              </span>
            ))}
          </div>
        ))}
      </div>

      <p
        className="mono"
        style={{ margin: '12px 0 0', fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}
      >
        {rellena(t('presupuesto.rendicion.recuento'), {
          pres: recuento.presupuestoAprobado.en,
          presDe: recuento.presupuestoAprobado.de,
          pleno: recuento.cuentaAprobada.en,
          plenoDe: recuento.cuentaAprobada.de,
          envio: recuento.enviada.en,
          envioDe: recuento.enviada.de,
        })}
        {sinFecha > 0 && rellena(t('presupuesto.rendicion.recuento.sinFecha'), { n: sinFecha })}
      </p>

      <div className="cp-rendicion-notas">
        <p>
          <MarcadoConHuecos
            texto={t('presupuesto.rendicion.nota.porque')}
            huecos={{
              '{ley}': (
                <ExtLink
                  href="https://www.boe.es/buscar/act.php?id=BOE-A-2021-21668#a4"
                  style={{ color: 'var(--civic)' }}
                >
                  {t('presupuesto.rendicion.nota.porque.ley')}
                </ExtLink>
              ),
            }}
          />
        </p>
        <p>
          <Marcado texto={t('presupuesto.rendicion.nota.fechas')} />
        </p>
        <ul>
          {COLUMNAS.map((c) => (
            <li key={c}>
              <strong>{titulos[c]}</strong> — «{PLAZOS[c].literal}» (
              <ExtLink href={PLAZOS[c].url} style={{ color: 'var(--civic)' }}>
                {PLAZOS[c].articulo}
              </ExtLink>
              )
            </li>
          ))}
        </ul>
        <p>{t('presupuesto.rendicion.nota.antesDe')}</p>
      </div>

      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 12 }}
      >
        <DataAsOf iso={data?.generatedAt} file="rendicion-cuentas.json" />
        <ExtLink href={data?.source?.consulta}>{t('presupuesto.rendicion.fuente')}</ExtLink>
      </div>
    </Card>
  )
}
