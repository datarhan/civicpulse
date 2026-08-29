import { Link, useParams } from 'react-router-dom'
import { Card } from '../components/Primitives'
import { EcuacionCoste } from '../components/eficiencia/EcuacionCoste'
import { estiloFicha } from '../components/eficiencia/ficha.css.js'
import { TicksPares } from '../components/eficiencia/TicksPares'
import { TablaPares } from '../components/eficiencia/TablaPares'
import { DeclaracionEntregas } from '../components/eficiencia/DeclaracionEntregas'
import { SerieServicio, enTerminosReales } from '../components/eficiencia/SerieServicio'
import { Lectura } from '../components/eficiencia/Lectura'
import { Resultado } from '../components/eficiencia/Resultado'
import { Concesion } from '../components/eficiencia/Concesion'
import { CompetenciaDelegada } from '../components/eficiencia/CompetenciaDelegada'
import { GESTION, MOTIVO } from '../components/eficiencia/vocabulario'
import { leerIndicador, lecturaVisible, chipDeclaracion } from '../scraper/indicador-lectura'
import { useIndicadores } from '../hooks/useIndicadores'
import { useCompetencias, indexarCompetencias, useNombresVisibles } from '../hooks/useCompetencias'
import { useOfficials } from '../hooks/useOfficials'
import { useT } from '../i18n'

/**
 * /eficiencia/:id — la ficha de un servicio.
 *
 * El libro contesta «¿cómo van los quince?»; esto contesta «¿y éste?». Antes
 * eran la misma pantalla y por eso ninguna de las dos preguntas se contestaba
 * bien: quince andamios de nueve partes en columna no dejan comparar, y una
 * tarjeta dentro de esa columna no tiene sitio para enseñar la división.
 *
 * DOS COLUMNAS, no nueve bloques en una de 820px. La ficha eran unos 2.500 px
 * de scroll —ecuación, lectura, ticks, cuantiles, década, rejilla de entregas,
 * congelados, resultado, tabla de pares, salvedades y fuente— en los que la
 * comparación y la declaración no compartían pantalla nunca, aunque el
 * argumento necesite las dos a la vez. Ahora la columna ancha lleva la CIFRA y
 * lo que la sitúa; la estrecha, lo que la CALIFICA: qué se declaró, de dónde
 * sale, qué salvedades arrastra y quién responde del área.
 *
 * TRES PASTILLAS ERAN TRES CLASES DE HECHO. La cabecera ponía en la misma fila
 * un aviso sobre la declaración, un dato de gobernanza (gestión directa) y una
 * etiqueta de taxonomía (el escalón), dibujados idénticos: es el defecto de la
 * rejilla de cuatro unidades del libro a escala de ficha. Ahora el aviso es una
 * tarjeta ámbar en la columna de al lado —porque es un aviso—, y la gobernanza
 * y el escalón bajan a una línea de meta bajo el título, que es lo que son.
 *
 * El nombre del titular de la competencia va al FINAL de la columna estrecha,
 * después de la frase que dice qué mide y qué no. El docblock de
 * `CompetenciaDelegada` lleva desde agosto explicando por qué: un nombre propio
 * pegado a «81.964,66 €/efectivo» construye «mira lo que cuesta lo suyo» antes
 * de que el lector llegue a la frase que lo desarma. Desde que el libro dejó de
 * tener columna de nombres, ESTA es la única superficie donde los quince
 * servicios los publican — y es la buena, porque aquí la salvedad del escalón
 * cabe en la misma tarjeta.
 */
export default function ServicioDetalle() {
  const { id } = useParams()
  const t = useT()
  const { loading, error, data } = useIndicadores()
  const { data: competencias } = useCompetencias()
  const { data: padron } = useOfficials()
  const nombresOn = useNombresVisibles()

  const i = (data?.indicadores ?? []).find((x) => x.id === id)

  const formatea = (v) => {
    if (typeof v !== 'number') return '—'
    const dec = v >= 1000 ? 0 : 2
    return `${v.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec })} ${i.unidad}`
  }

  if (loading) {
    return (
      <div className="cp-page" style={{ padding: 24, maxWidth: 820, margin: '0 auto' }}>
        <p style={{ color: 'var(--ink70)' }}>Cargando…</p>
      </div>
    )
  }

  if (error || !i) {
    return (
      <div className="cp-page" style={{ padding: 24, maxWidth: 820, margin: '0 auto' }}>
        <Link
          to="/eficiencia"
          className="mono"
          style={{ fontSize: 'var(--fs-micro)', color: 'var(--civic)' }}
        >
          ← El libro de servicios
        </Link>
        <Card style={{ marginTop: 16 }}>
          <p style={{ margin: 0, color: 'var(--ink70)' }}>
            No hay ninguna ficha con ese identificador en la entrega publicada.
          </p>
        </Card>
      </div>
    )
  }

  const cita = i.citas?.[0]
  const entrega = cita?.entrega ?? data?.anioBase
  const gestion = GESTION[i.modoGestion] ?? GESTION['sin-clasificar']
  const chip = chipDeclaracion(i)
  const lecturaEntera = leerIndicador(i)
  const lectura = lecturaVisible(lecturaEntera, { banda: Boolean(i.pares), cifra: true })
  const salvedades = [...(lecturaEntera.avisos ?? []), ...(i.caveats ?? [])]
  const motivo = i.numerador.motivo ?? i.denominador.motivo
  const competencia = nombresOn ? indexarCompetencias(competencias).get(i.id) : null
  /**
   * El retrato del titular, resuelto aquí y no dentro de la tarjeta.
   *
   * La ruta sale de `officials.json` por el slug `oficial` que la asignación YA
   * trae firmado. Esa es la diferencia que hace que el cruce sea seguro: lo
   * congelado es la clave, así que un raspado nocturno puede cambiar los bytes
   * del retrato pero no a QUIÉN se retrata junto a una cifra publicada. Deducir
   * el nombre de ese fichero sí sería el defecto que `competencias.json` existe
   * para evitar; deducir la imagen de una persona ya nombrada, no.
   *
   * `fotoRetirada` manda sobre todo lo demás. Es la promesa de /aviso-legal —se
   * va la foto, se queda el registro— y vive en el fichero curado porque
   * `scrape:officials` corre cada noche: borrar el JPG lo restauraría de
   * madrugada.
   *
   * `?? null` y no `?? ''`: sin entrada en el padrón la tarjeta pinta
   * iniciales, que es lo mismo que hace ante una retirada. `check:competencias`
   * es quien distingue esos dos casos y avisa, porque un hueco silencioso en la
   * página no puede.
   */
  const foto =
    competencia && !competencia.fotoRetirada
      ? ((padron?.officials ?? []).find((o) => o.slug === competencia.oficial)?.photoUrl ?? null)
      : null
  const resultado = (data?.resultados?.items ?? []).find((r) => r.servicioRelacionado === i.id)
  // Todo o nada: si a una entrega declarada le falta su índice, la serie
  // entera vuelve a euros corrientes y el rótulo lo dice. Mezclar las dos
  // haría que la distancia entre la línea y la mediana dejara de significar.
  const serie = enTerminosReales((i.serie ?? []).filter((p) => p.estado === 'declarado'))

  const rotulo = {
    fontSize: 'var(--fs-micro)',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '.07em',
    color: 'var(--ink50)',
  }

  return (
    <div className="cp-page" style={{ padding: 24, maxWidth: 1180, margin: '0 auto' }}>
      <style>{estiloFicha}</style>
      <Link
        to="/eficiencia"
        className="mono"
        style={{ fontSize: 'var(--fs-micro)', color: 'var(--civic)' }}
      >
        ← El libro de servicios
      </Link>

      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
          color: 'var(--ink50)',
          marginTop: 12,
        }}
      >
        Coste efectivo · entrega {entrega} · programa {i.servicio}
      </div>
      <h1
        style={{
          fontSize: 'var(--fs-page)',
          fontWeight: 700,
          letterSpacing: '-.02em',
          margin: '2px 0 0',
          lineHeight: 1.15,
        }}
      >
        {i.etiqueta}
      </h1>
      {/* Gobernanza y taxonomía, en una línea de meta. NO son pastillas: una
          pastilla dice «esto es un estado», y ni el modo de gestión ni el
          escalón lo son. El aviso sobre la declaración —que sí lo es— vive en
          su tarjeta ámbar, en la columna de al lado. */}
      <div
        className="mono"
        style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)', marginTop: 8 }}
      >
        {gestion.label} · escalón: {t(`eficiencia.tier.${i.tier}`)}
        {i.pares ? ` · comparable (n=${i.pares.n})` : ' · sin grupo comparable'}
      </div>

      {i.valor === null ? (
        <>
          <p
            style={{
              margin: '16px 0 0',
              fontSize: 'var(--fs-aux)',
              color: 'var(--ink70)',
              lineHeight: 1.6,
            }}
          >
            <strong>Sin cociente posible.</strong> {MOTIVO[motivo] ?? MOTIVO.ausente}
          </p>
          <p
            className="mono"
            style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink50)', marginTop: 8 }}
          >
            {/* El tercer sitio con el mismo binario, y el más rotundo: esta
                frase afirmaba «la casilla viene vacía» en una ficha cuya
                cabecera dice ENTREGA 2024, y en 2024 el ministerio declara
                1.898.034,08 € para el agua. `valor === null` no significa que
                la fuente calle; significa que aquí no se divide. */}
            {i.numerador.valor !== null
              ? `Coste declarado: ${i.numerador.valor.toLocaleString('es-ES')} €`
              : i.numerador.declaradoNoComparable !== undefined
                ? `El ayuntamiento declara ${i.numerador.declaradoNoComparable.toLocaleString('es-ES')} € en esta entrega. No se divide: en una concesión ese coste no es el que soporta el ayuntamiento.`
                : 'El ayuntamiento no declara coste para este servicio: la casilla viene vacía, no a cero.'}
          </p>
          {/* Sin el `que`: para una ficha bloqueada, `MOTIVO` dice lo mismo y
              más —incluye por qué compararla diría que aquí es gratis—, así que
              dejar las dos frases era decirlo dos veces. Lo que se queda es el
              `como`, que es la parte que MOTIVO no cubre: esto es un hecho
              sobre la declaración, no un hueco de esta página. */}
          <Lectura lectura={{ ...lectura, que: null }} />
          <Concesion concesion={i.concesion} />
        </>
      ) : (
        <div className="cp-ficha-cols">
          <div>
            <EcuacionCoste indicador={i} formatea={formatea} entrega={entrega} />
            <Lectura lectura={lectura} comoPrimero />
            <TicksPares indicador={i} formatea={formatea} />
            <TablaPares pares={i.pares} formatea={formatea} />

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border2)' }}>
              <span className="mono" style={rotulo}>
                La década ·{' '}
                {serie.reales
                  ? `euros constantes de ${entrega}`
                  : 'euros corrientes: falta el índice de algún año'}
              </span>
              <SerieServicio puntos={serie.puntos} formatea={formatea} unidad={i.unidad} />
            </div>
          </div>

          <div className="cp-ficha-rail">
            {/* El aviso sobre la declaración, que era una pastilla más en una
                fila de tres. Aquí es lo que es: una advertencia, con su motivo
                y con el contexto de cuántos comparables hacen lo mismo. */}
            {/* UN SOLO HUECO para los avisos sobre la declaración, y siempre el
                mismo. La revisión anotó que la silueta de la ficha cambiaba de
                servicio a servicio sin que nada lo anunciara: `avisoDeclaracion`
                y el chip del divisor congelado aparecían y desaparecían en
                sitios distintos. Son la misma clase de hecho —algo que la
                DECLARACIÓN tiene de raro— así que comparten tarjeta, rótulo y
                ámbar, y lo que varía es cuántos párrafos trae dentro.

                `avisoDeclaracion` además se había perdido entero al reescribir
                esta página: lo trae el transporte urbano y es la frase que
                explica su casilla de viajeros a cero. Una ficha menos hablada
                sin que nadie lo pidiera. */}
            {(chip || i.avisoDeclaracion) && (
              <div className="cp-card" style={{ borderLeft: '3px solid var(--warn)' }}>
                <div className="mono" style={{ ...rotulo, color: 'var(--warn-ink)' }}>
                  Sobre la declaración
                </div>
                {i.avisoDeclaracion && (
                  <p
                    style={{
                      margin: '9px 0 0',
                      fontSize: 'var(--fs-aux)',
                      color: 'var(--ink70)',
                      lineHeight: 1.6,
                    }}
                  >
                    {i.avisoDeclaracion}
                  </p>
                )}
                {chip && (
                  <p
                    style={{
                      margin: '9px 0 0',
                      fontSize: 'var(--fs-aux)',
                      color: 'var(--ink70)',
                      lineHeight: 1.6,
                    }}
                  >
                    {chip.texto}. El cociente puede subir sin que el servicio haya cambiado: nadie
                    ha vuelto a medir el denominador.
                  </p>
                )}
                {i.declaracion?.paresMedibles > 0 && (
                  <p
                    style={{
                      margin: '10px 0 0',
                      paddingTop: 10,
                      borderTop: '1px solid var(--border2)',
                      fontSize: 'var(--fs-micro)',
                      color: 'var(--ink50)',
                      lineHeight: 1.55,
                    }}
                  >
                    No es una rareza local:{' '}
                    <strong className="mono">
                      {i.declaracion.paresCongelados} de {i.declaracion.paresMedibles}
                    </strong>{' '}
                    comparables medibles hacen lo mismo con esta misma cifra.
                  </p>
                )}
              </div>
            )}

            <div className="cp-card">
              <div className="mono" style={rotulo}>
                Fuente y réplica
              </div>
              {cita && (
                <p
                  className="mono"
                  style={{
                    margin: '9px 0 0',
                    fontSize: 'var(--fs-micro)',
                    color: 'var(--ink50)',
                    lineHeight: 1.6,
                  }}
                >
                  Coste efectivo {cita.entrega} · celda{' '}
                  <span style={{ color: 'var(--ink70)' }}>
                    {String(i.numerador.fuente ?? '')
                      .split(':')
                      .slice(2)
                      .join(':')}
                  </span>
                  <br />
                  <a
                    href={cita.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    style={{ color: 'var(--civic)' }}
                  >
                    Ministerio de Hacienda ↗
                  </a>
                </p>
              )}
              <p
                style={{
                  margin: '10px 0 0',
                  paddingTop: 10,
                  borderTop: '1px solid var(--border2)',
                  fontSize: 'var(--fs-micro)',
                  color: 'var(--ink50)',
                  lineHeight: 1.6,
                }}
              >
                Derecho de réplica abierto para el ayuntamiento:{' '}
                <a href="/aviso-legal" style={{ color: 'var(--civic)' }}>
                  cómo responder
                </a>
                .
              </p>
            </div>

            <div className="cp-card">
              <div className="mono" style={rotulo}>
                Salvedades · {salvedades.length}
              </div>
              {salvedades.length > 0 ? (
                <>
                  {/* El recuento sigue completo, y la lista también: una
                      salvedad que desaparece de la ficha es una salvedad que
                      deja de constar. Lo que cambia es el ORDEN de lectura —
                      cada una está dicha arriba, junto a la cifra que corrige,
                      y esto es el registro, no su primera aparición. Era el
                      hallazgo crítico de la revisión: la frase que impide leer
                      un precio como un rendimiento no puede vivir sólo aquí. */}
                  <p
                    style={{
                      margin: '9px 0 0',
                      fontSize: 'var(--fs-micro)',
                      color: 'var(--ink50)',
                      lineHeight: 1.55,
                    }}
                  >
                    Cada una está dicha arriba, junto a la cifra que corrige. Aquí quedan recogidas
                    juntas.
                  </p>
                  <ul
                    style={{
                      margin: '9px 0 0',
                      paddingLeft: 16,
                      fontSize: 'var(--fs-micro)',
                      color: 'var(--ink50)',
                      lineHeight: 1.55,
                    }}
                  >
                    {salvedades.map((c) => (
                      <li key={c} style={{ marginBottom: 6 }}>
                        {c}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p
                  style={{ margin: '9px 0 0', fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}
                >
                  Esta ficha no arrastra ninguna.
                </p>
              )}
              <p
                style={{
                  margin: '10px 0 0',
                  fontSize: 'var(--fs-micro)',
                  color: 'var(--ink50)',
                  lineHeight: 1.55,
                }}
              >
                Las reglas numeradas que citan estas salvedades:{' '}
                <a href="/metodologia#reglas-eficiencia" style={{ color: 'var(--civic)' }}>
                  reglas de filtrado y comparabilidad
                </a>
                .
              </p>
            </div>

            {/* Quién responde del área. Va el ÚLTIMO de la columna, y la
                columna empieza más abajo que la cifra: el orden que el docblock
                de CompetenciaDelegada defiende sigue siendo el orden en que se
                lee, también en dos columnas. */}
            {competencia && (
              <div className="cp-card">
                <div className="mono" style={rotulo}>
                  Quién responde de esta área
                </div>
                <CompetenciaDelegada
                  asignacion={competencia}
                  conFoto
                  foto={foto}
                  fuente={competencias?.fuente}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {i.valor !== null && (
        <DeclaracionEntregas
          indicador={i}
          entregasPublicadas={data?.cobertura?.entregasPublicadas}
          noPresentadas={data?.cobertura?.entregasNoPresentadas ?? []}
        />
      )}

      {/* El resultado sale de la columna del coste y se va a su propia
          superficie ancha. Su `comoSeLee` ya dice que no se puede leer contra
          la tarjeta de al lado y que nunca se divide por ella; apilarlo dentro
          de la misma columna, justo detrás de la serie de coste, invitaba
          exactamente a esa lectura. Necesitaba otra superficie, no otro
          titular. */}
      {resultado && <Resultado resultado={resultado} id={`r-${i.id}`} />}
    </div>
  )
}
