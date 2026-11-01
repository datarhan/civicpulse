import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { sesionesDelUltimoAnio } from '../../scraper/en-breve-plenos'
import { hoyEnRibarroja } from '../../scraper/en-breve-portada'
import { rutaDeSesion } from '../../scraper/ruta-de-sesion'
import { fmtDateLong, rellena } from '../../lib/formatters'
import { estiloEnBrevePlenos } from './plenos.css.js'
import { rotuloDe, useLocale } from '../../i18n'

/*
 * «Los plenos del último año»: la lista de sesiones en la lectura vecinal
 * (auditoría de las dos lecturas, §9). La tabla de abajo cuenta lo que hemos
 * procesado de cada sesión; esto dice de qué trató: la fecha, el tipo y los dos
 * primeros puntos que se llevaron a votar, con su etiqueta llana, y cuántos más.
 * Lo deriva `sesionesDelUltimoAnio`; la última sesión ya tiene su tarjeta encima
 * y no se repite.
 *
 * «Para decidir» rotula lo que se llevó a votar, no lo que se aprobó, como en
 * «El último pleno». Sin orden del día recogido, se dice; nunca «0 puntos».
 */

/**
 * @param {{
 *   filas: object[],
 *   agendas: { plenos?: object[] } | null,
 * }} props
 */
export function SesionesDelAnio({ filas, agendas }) {
  const { t, locale } = useLocale()
  // Sin el orden del día no se pinta: una sesión aún sin él diría «todavía no
  // lo hemos recogido», que puede ser falso.
  const sesiones = useMemo(
    () =>
      agendas
        ? sesionesDelUltimoAnio({
            sesiones: filas,
            agendas: agendas.plenos ?? [],
            hoy: hoyEnRibarroja(),
          })
        : [],
    [filas, agendas],
  )
  if (sesiones.length === 0) return null

  return (
    <section
      className="cp-card cp-en-breve cp-plenos-anio"
      data-tarjeta=""
      data-plenos-anio=""
      aria-labelledby="plenos-anio-titulo"
    >
      <style>{estiloEnBrevePlenos}</style>
      <div className="cp-en-breve-cabeza">
        <div>
          <h2 id="plenos-anio-titulo" className="cp-en-breve-titulo">
            {t('plenos.anio.titulo')}
          </h2>
          <p className="cp-en-breve-intro">{t('plenos.anio.intro')}</p>
        </div>
        <a href="#sesiones" className="cp-en-breve-saltar">
          {t('plenos.anio.saltar')}
        </a>
      </div>
      <ol className="cp-plenos-anio-lista">
        {sesiones.map((s) => {
          const fila = filas.find((f) => f.id === s.id)
          const tipo = s.tipo ? rotuloDe(t, `pleno.tipo.${s.tipo}`, null) : null
          const o = s.ordenDelDia
          return (
            <li key={s.id}>
              <div className="cp-plenos-anio-sesion">
                <Link to={fila ? rutaDeSesion(fila, filas) : `/plenos/${s.id}`}>
                  {fmtDateLong(s.fecha, locale)}
                </Link>
                {tipo && (
                  <span className="cp-plenos-anio-tipo">{tipo.toLocaleLowerCase(locale)}</span>
                )}
              </div>
              <div className="cp-plenos-anio-puntos">
                {!o ? (
                  <p>{t('plenos.anio.sinOrden')}</p>
                ) : o.destacados.length > 0 ? (
                  <>
                    <span className="cp-plenos-anio-rotulo">{t('plenos.anio.decidir')}</span>
                    <ul>
                      {o.destacados.map((p) => (
                        <li key={p.numero}>
                          <span className="cp-plenos-puntos-texto" title={p.titulo}>
                            {p.texto}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {o.masDecidir > 0 && (
                      <span className="cp-plenos-anio-mas">
                        {rellena(t('plenos.anio.mas'), { n: o.masDecidir })}
                      </span>
                    )}
                  </>
                ) : (
                  <p>
                    {t(
                      o.masDecidir > 0
                        ? 'plenos.anio.soloActa'
                        : o.informes > 0
                          ? 'plenos.anio.soloInformes'
                          : 'plenos.anio.nadaQueDecidir',
                    )}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
