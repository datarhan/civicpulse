import { Card, Pill, SectionHead } from '../Primitives'
import { useT } from '../../i18n'
import { COMO_SE_LEE } from '../../scraper/indicador-lectura'
import { TIER_TONE, ORDEN_TIER } from './Escalones'

/**
 * Qué es un coste unitario y qué NO se puede concluir de que sea alto.
 *
 * ## Por qué existe
 *
 * La página ya contestaba «¿gastar más es bueno o malo?» — pero repartido en
 * trece tarjetas, una por servicio, de modo que la respuesta sólo se formaba
 * en la cabeza de quien las leyera todas. Un vecino que entra por la ficha de
 * la policía se lleva la frase de `input` y ninguna de las otras dos, y sale
 * creyendo que la regla que acaba de leer vale para la basura. La regla es de
 * la CLASE de divisor, no del servicio, así que se puede decir tres veces en
 * lugar de trece, y arriba.
 *
 * ## Por qué no hay una nota, ni un «bien/mal»
 *
 * Porque la fuente no la respalda. El retorno del ministerio publica lo que
 * costó un servicio y cuánta cantidad se prestó; no publica **ningún**
 * indicador de calidad con el que contrastarlo. Un coste bajo puede ser
 * eficiencia o puede ser menos servicio, y esta página no puede distinguirlos
 * — decirlo es más honesto que puntuar, y es lo único que la división
 * respalda.
 *
 * ## De dónde sale el texto
 *
 * De `COMO_SE_LEE`, el MISMO objeto del que cada tarjeta saca su frase. Está
 * exportado para eso. Parafrasearlo aquí habría creado la segunda versión que
 * se queda vieja en cuanto alguien afine la de abajo, que es el modo de fallo
 * nº1 de docs/DATA_INTEGRITY.md; y `tests/como-se-lee-sin-copias.test.jsx`
 * comprueba que lo de arriba y lo de las tarjetas siguen siendo la misma
 * cadena.
 *
 * Sólo se listan los escalones EN JUEGO, como hace `LeyendaEscalones`:
 * enseñarle a alguien una categoría que no va a encontrar en la página es
 * gastarle atención en nada.
 */
export function ComoSeLee({ indicadores = [] }) {
  const t = useT()
  const conRatio = indicadores.filter((i) => i.valor !== null)
  const presentes = ORDEN_TIER.filter((tier) => conRatio.some((i) => i.tier === tier))
  if (presentes.length === 0) return null

  return (
    <Card style={{ marginTop: 18 }}>
      <SectionHead
        as="h3"
        size="head"
        eyebrow="Regla de lectura"
        title="Cómo se lee un coste unitario"
      />
      <p
        style={{
          margin: '6px 0 0',
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink70, var(--ink50))',
        }}
      >
        Todas las cifras de abajo son una división: lo que costó un servicio en un año, entre la
        cantidad de ese servicio que el ayuntamiento declara haber prestado. Lo que se puede
        concluir de que salga alta o baja depende de <strong>qué hay en el divisor</strong>, y hay
        tres casos.
      </p>

      {/* Los tres escalones, en rejilla y no apilados. Son tres piezas del mismo
          rango y la misma longitud: en columna dejaban el bloque el doble de
          alto y dos tercios del ancho en blanco. `auto-fit` los apila solo
          cuando no caben, sin necesitar una media query que un estilo inline no
          puede llevar. */}
      <dl
        style={{
          margin: '12px 0 0',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 16,
          alignItems: 'start',
        }}
      >
        {presentes.map((tier) => (
          <div key={tier} style={{ minWidth: 0 }}>
            <dt style={{ marginBottom: 2 }}>
              <Pill tone={TIER_TONE[tier] ?? 'neutral'} size="xs">
                {t(`eficiencia.tier.${tier}`)}
              </Pill>
            </dt>
            <dd
              style={{
                margin: 0,
                fontSize: 'var(--fs-aux)',
                color: 'var(--ink70, var(--ink50))',
                lineHeight: 1.55,
              }}
            >
              {COMO_SE_LEE[tier]}
            </dd>
          </div>
        ))}
      </dl>

      <p
        style={{
          margin: '14px 0 0',
          paddingLeft: 10,
          borderLeft: '3px solid var(--border)',
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink70, var(--ink50))',
        }}
      >
        <strong>Por eso esta página no pone nota.</strong> Ninguna de estas cifras mide si el
        servicio está bien prestado: el retorno del ministerio no publica un solo indicador de
        calidad con el que contrastarlas. Un coste bajo puede ser eficiencia o puede ser menos
        servicio, y la fuente no distingue las dos cosas. Lo que sí se puede hacer es lo que hace
        cada ficha: decir de dónde sale el número, contra quién se compara y qué lo puede torcer.
      </p>
    </Card>
  )
}
