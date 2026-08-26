import { useT } from '../../i18n'
import { EjePercentil } from './EjePercentil'
import { MiniSerieSvg } from './MiniSerieSvg'
import { enTerminosReales, puntosEnEscala } from './SerieServicio'
import { GESTION, unidadCorta } from './vocabulario'
import { posicionServicio, razonMediana } from '../../scraper/indicador-areas'
import { chipDeclaracion } from '../../scraper/indicador-lectura'

const DIRECCION = {
  arriba: 'por encima',
  abajo: 'por debajo',
}

const num = (v, dec) =>
  v.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec })

/**
 * Una fila del libro de servicios — cinco columnas, no ocho.
 *
 * Las ocho anteriores decían cosas ciertas y ninguna cabía: «Década» y «Quién
 * responde» caían fuera de pantalla a anchos normales y «Qué se puede decir»
 * era prosa dentro de una celda. Eso no era una tabla, eran quince fichas
 * forzadas a rejilla — el libro había resuelto la comparación y heredado el
 * problema de la ficha.
 *
 * Lo que se pliega, no lo que se pierde:
 *
 *   · el COSTE baja a la línea de su servicio, que es de lo que habla;
 *   · el DIVISOR sube a la celda del cociente, debajo de la cifra que divide.
 *     Un cociente sin su denominador no se puede juzgar, y era la mitad de la
 *     ecuación que esta tabla escondía;
 *   · el VEREDICTO deja de ser una pastilla y pasa al texto que ya acompañaba
 *     al eje: «p85 · banda 75-94 · por encima». Misma información, una línea
 *     menos, y sin una pastilla que compite con la geometría de al lado;
 *   · QUIÉN RESPONDE se va entera a la ficha. No es una supresión: en
 *     `/eficiencia/:id` el nombre va en la misma tarjeta que la salvedad que lo
 *     desarma, y una columna de tabla no tiene sitio para eso. El docblock de
 *     `CompetenciaDelegada` lleva desde agosto explicando que un nombre propio
 *     pegado a «81.964,66 EUR/efectivo» construye «mira lo que cuesta lo suyo»
 *     antes de que el lector llegue a la frase que lo corrige; en una tabla esa
 *     frase no cabe en ningún sitio. `competencias-superficies.ts` sigue a los
 *     nombres hasta su nueva página en vez de dar por buena la vieja.
 *
 * La posición no se colorea nunca, y el ámbar tampoco pinta la fila entera: en
 * esta entrega trece de quince declaraciones están congeladas, así que un fondo
 * ámbar por cada una habría dejado la tabla ámbar de arriba abajo y el ámbar
 * significando «fila». Va donde dice algo: el «sin remedir desde» que cuelga
 * del divisor, que habla de la DECLARACIÓN y nunca del coste.
 */
export function FilaServicio({ indicador, formatea, x0, x1, chipHoisted = false }) {
  const t = useT()
  const i = indicador
  const pos = posicionServicio(i)
  const razon = razonMediana(i)
  const chip = chipDeclaracion(i)
  const gestion = GESTION[i.modoGestion] ?? GESTION['sin-clasificar']
  const serie = enTerminosReales((i.serie ?? []).filter((p) => p.estado === 'declarado'))
  const dibujable = puntosEnEscala(serie.puntos).length >= 2

  // Entre qué divide, en palabras de la propia fuente: la cantidad declarada y
  // el nombre que el ministerio le da. Una fila sin cociente TAMBIÉN lo lleva
  // —el agua declara 270.630 m de red y ningún coste— porque el hueco está en
  // el numerador, y decir sólo «—» dejaría al lector creyendo que falta todo.
  const divisorTxt = [
    i.denominador.valor === null ? null : i.denominador.valor.toLocaleString('es-ES'),
    i.divisor.plural ?? null,
  ]
    .filter(Boolean)
    .join(' ')

  // El texto que sostiene la geometría. La posición no puede quedar codificada
  // sólo por un punto lleno o hueco: va también aquí, en el DOM, que es lo que
  // encuentran un lector de pantalla y la pasada axe. Desde que la columna del
  // veredicto se plegó aquí, lleva además la dirección en palabras — la flecha
  // de la pastilla era lo único que la decía sin leer el percentil.
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
      }${DIRECCION[pos] ? ` · ${DIRECCION[pos]}` : ''}`
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
        {/* «—», nunca «0 €». El motor DESCARTA a propósito el coste de un
            servicio concedido —lo paga el concesionario y lo recupera del
            recibo— y `numerador.valor` viene a null, no a cero. Escribir un
            cero ahí publica una cifra que el snapshot se niega a publicar, y
            un cero junto a un servicio real se lee como «aquí es gratis»: la
            trampa exacta que esta página se construyó para no pisar. Lo cazó
            review:surfaces. */}
        <span className="cp-fila-coste mono">
          {i.numerador.valor === null
            ? 'coste no declarado'
            : `${num(i.numerador.valor, 0)} € de coste declarado`}
        </span>
      </td>

      <td className="cp-c-unidad mono">
        {i.valor === null ? (
          <span style={{ color: 'var(--ink50)' }}>—</span>
        ) : (
          <>
            {formatea(i.valor).replace(/\s*€\/.*$/, ' €')}
            <span
              style={{
                color: 'var(--ink50)',
                fontSize: 'var(--fs-meta)',
                fontWeight: 400,
              }}
            >
              {unidadCorta(i.unidad)}
            </span>
          </>
        )}
        {/* Entre qué divide. Con la banda levantada, la fila conserva sólo lo
            que la DISTINGUE de las demás —desde qué entrega no se remide— y la
            frase entera vive una vez encima de la tabla. Sin banda, el chip
            vuelve completo. */}
        <span className="cp-fila-divisor">
          {`÷ ${divisorTxt}`}
          {chip && (
            <span className="cp-divisor-desde">
              {chipHoisted && chip.desde
                ? ` · sin remedir desde ${chip.desde}`
                : ` · ${chip.texto}`}
            </span>
          )}
        </span>
      </td>

      <td
        className="cp-c-razon mono"
        style={pos === 'indistinguible' ? { color: 'var(--ink50)' } : undefined}
      >
        {razon === null ? '—' : `×${num(razon, 2)}`}
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
                  : `queda ${DIRECCION[pos] ?? 'sin situar'} de la mediana`
              }`}
            />
            <span className="cp-fila-meta mono">{posTexto}</span>
          </>
        ) : (
          <span className="cp-fila-meta mono">{posTexto}</span>
        )}
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
    </tr>
  )
}
