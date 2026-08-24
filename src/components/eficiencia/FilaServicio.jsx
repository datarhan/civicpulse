import { useT } from '../../i18n'
import { EjePercentil } from './EjePercentil'
import { MiniSerieSvg } from './MiniSerieSvg'
import { enTerminosReales, puntosEnEscala } from './SerieServicio'
import { GESTION, unidadCorta } from './vocabulario'
import { posicionServicio, razonMediana } from '../../scraper/indicador-areas'
import { chipDeclaracion } from '../../scraper/indicador-lectura'

const VEREDICTO = {
  arriba: { texto: '↑ por encima', estilo: 'solido' },
  abajo: { texto: '↓ por debajo', estilo: 'solido' },
  indistinguible: { texto: '≈ indistinguible', estilo: 'discontinuo' },
  'sin-comparacion': { texto: 'sin comparación', estilo: 'discontinuo' },
}

const num = (v, dec) =>
  v.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec })

/**
 * Una fila del libro de servicios.
 *
 * Las siete columnas de datos van en el orden en que se contesta la pregunta:
 * qué servicio, cuánto costó, cuánto por unidad, dónde queda, cuántas veces la
 * mediana, por dónde vino y qué se puede decir. «Quién responde» va la ÚLTIMA,
 * después de la salvedad, y no es casualidad: el docblock de
 * `CompetenciaDelegada` lleva desde agosto explicando que un nombre propio
 * pegado a «81.964,66 €/efectivo» construye «mira lo que cuesta lo suyo» antes
 * de que el lector llegue a la frase que lo desarma. En una tabla la frase que
 * desarma es la columna anterior.
 *
 * La posición no se colorea nunca, y el ámbar tampoco pinta la fila entera: en
 * esta entrega trece de quince declaraciones están congeladas, así que un fondo
 * ámbar por cada una habría dejado la tabla ámbar de arriba abajo y el ámbar
 * significando «fila». Va donde dice algo: el punto y la línea de la última
 * columna, que hablan de la DECLARACIÓN y nunca del coste.
 */
export function FilaServicio({ indicador, formatea, competencia, x0, x1, conNombres }) {
  const t = useT()
  const i = indicador
  const pos = posicionServicio(i)
  const v = VEREDICTO[pos]
  const razon = razonMediana(i)
  const chip = chipDeclaracion(i)
  const gestion = GESTION[i.modoGestion] ?? GESTION['sin-clasificar']
  const serie = enTerminosReales((i.serie ?? []).filter((p) => p.estado === 'declarado'))
  const dibujable = puntosEnEscala(serie.puntos).length >= 2

  // El texto que sostiene la geometría. La posición no puede quedar codificada
  // sólo por un punto lleno o hueco: va también aquí, en el DOM, que es lo que
  // encuentran un lector de pantalla y la pasada axe.
  //
  // Tres motivos distintos para no situarse, y decirlos como uno solo era
  // falso: el agua y el alcantarillado NO se quedan sin posición por falta de
  // comparables, se quedan sin cociente porque su coste no cruza los libros del
  // ayuntamiento. Culpar a la muestra de eso inventaba una carencia que no hay.
  const posTexto = i.pares
    ? `p${i.pares.percentil}${
        Array.isArray(i.pares.percentilBanda)
          ? ` · banda ${i.pares.percentilBanda[0]}–${i.pares.percentilBanda[1]}${
              pos === 'indistinguible' ? ' cruza la mediana' : ''
            }`
          : ''
      }`
    : i.valor === null
      ? (i.numerador.motivo ?? i.denominador.motivo) === 'concesion'
        ? // NO «fuera de los libros del ayuntamiento» a secas: la revisión de
          // superficies leyó eso como que la casa no tiene ninguna relación
          // económica con el agua, y en la misma página hay una concesión de
          // 55,69 M€ hasta 2043. Lo que está fuera es el COSTE declarado.
          'sin coste declarado: lo paga el concesionario'
        : 'sin cociente en esta entrega'
      : 'no llegan a quince comparables (reglas 4 y 5)'

  return (
    <tr className="cp-fila">
      <td className="cp-c-servicio">
        <a href={`/eficiencia/${i.id}`}>{i.etiqueta}</a>
        <span className="cp-fila-meta mono">
          {i.servicio ? `${i.divisor.plural} · ` : ''}
          {t(`eficiencia.tier.${i.tier}`)}
          {i.modoGestion !== 'directa' ? ` · ${gestion.label}` : ''}
          {i.pares ? ` · n=${i.pares.n}` : ''}
        </span>
      </td>

      <td className="cp-c-coste mono">
        {/* «—», nunca «0 €». El motor DESCARTA a propósito el coste de un
            servicio concedido —lo paga el concesionario y lo recupera del
            recibo— y `numerador.valor` viene a null, no a cero. Escribir un
            cero ahí publica una cifra que el snapshot se niega a publicar, y
            un cero junto a un servicio real se lee como «aquí es gratis»: la
            trampa exacta que esta página se construyó para no pisar. Lo cazó
            review:surfaces. */}
        {i.numerador.valor === null ? (
          <span style={{ color: 'var(--ink50)' }}>—</span>
        ) : (
          `${num(i.numerador.valor, 0)} €`
        )}
      </td>

      <td className="cp-c-unidad mono">
        {i.valor === null ? (
          <span style={{ color: 'var(--ink50)' }}>—</span>
        ) : (
          <>
            {formatea(i.valor).replace(/\s*€\/.*$/, ' €')}
            <span style={{ color: 'var(--ink50)' }}>{unidadCorta(i.unidad)}</span>
          </>
        )}
      </td>

      <td className="cp-c-posicion">
        {i.pares ? (
          <>
            <EjePercentil
              percentil={i.pares.percentil}
              banda={i.pares.percentilBanda}
              descripcion={`${i.etiqueta}: percentil ${i.pares.percentil} entre ${i.pares.n} comparables; ${
                pos === 'indistinguible'
                  ? 'la banda plausible cruza la mediana, así que la posición no se distingue'
                  : `queda ${v.texto.slice(2)} de la mediana`
              }`}
            />
            <span className="cp-fila-meta mono">{posTexto}</span>
          </>
        ) : (
          <span className="cp-fila-meta mono">{posTexto}</span>
        )}
      </td>

      <td
        className="cp-c-razon mono"
        style={pos === 'indistinguible' ? { color: 'var(--ink50)' } : undefined}
      >
        {razon === null ? '—' : `×${num(razon, 2)}`}
      </td>

      <td className="cp-c-decada">
        {dibujable ? (
          <>
            <MiniSerieSvg puntos={serie.puntos} x0={x0} x1={x1} alto={24} conMediana />
            {/* Sólo la EXCEPCIÓN. «€ constantes» lo dice el pie de la tabla una
                vez; repetirlo quince veces gastaba dos líneas por fila para no
                distinguir ninguna de ninguna. Lo que sí distingue es la fila
                que no puede ir deflactada, y ésa se marca. */}
            {!serie.reales && <span className="cp-fila-meta mono">euros corrientes</span>}
          </>
        ) : (
          <span className="cp-fila-meta mono">sin serie dibujable</span>
        )}
      </td>

      <td className="cp-c-decir">
        <span className={`cp-veredicto cp-veredicto-${v.estilo}`}>{v.texto}</span>
        {chip && (
          <span className="cp-fila-declara mono">
            <span className="cp-punto-warn" />
            {chip.texto}
          </span>
        )}
      </td>

      {conNombres && (
        <td className="cp-c-responde">
          {competencia ? (
            <>
              <a href={`/cargos/${competencia.oficial}`}>{competencia.nombre}</a>
              <span className="cp-fila-meta mono">
                {competencia.cargo}
                {/* «Atribución nuestra» no puede quedarse en una marca: el aviso
                    legal promete que además se explica POR QUÉ, y el motivo vive
                    en la ficha. La marca lleva hasta él. */}
                {competencia.confianza === 'editorial' && (
                  <>
                    {' · '}
                    <a href={`/eficiencia/${i.id}`}>atribución nuestra</a>
                  </>
                )}
              </span>
            </>
          ) : (
            <span className="cp-fila-meta mono">sin asignar</span>
          )}
        </td>
      )}
    </tr>
  )
}
