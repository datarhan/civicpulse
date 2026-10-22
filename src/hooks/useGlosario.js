import { useMemo } from 'react'
import { useT } from '../i18n'

/**
 * Las entradas del glosario en el idioma del lector: término, definición y la
 * sección que lo explica con sus cifras.
 *
 * Las claves van literales —no `glosario.${clave}.def`— porque el guard de
 * `i18n-catalogue` lee las llamadas, y una clave compuesta le escondería qué
 * cadenas se usan. Una clave nueva en `GLOSARIO` (src/glosario.js) necesita su
 * fila aquí; `tests/en-breve-presupuesto.test.jsx` lo comprueba.
 *
 * @returns {{ clave: string, termino: string, def: string, to: string }[]}
 */
export function useGlosario() {
  const t = useT()
  // Memorizado: Cmd+K lo pone en las dependencias de su índice.
  return useMemo(
    () => [
      {
        clave: 'creditoDefinitivo',
        termino: t('glosario.creditoDefinitivo.termino'),
        def: t('glosario.creditoDefinitivo.def'),
        to: '/presupuesto#cascada',
      },
      {
        clave: 'obligacionesReconocidas',
        termino: t('glosario.obligacionesReconocidas.termino'),
        def: t('glosario.obligacionesReconocidas.def'),
        to: '/presupuesto#cascada',
      },
      {
        clave: 'deudaViva',
        termino: t('glosario.deudaViva.termino'),
        def: t('glosario.deudaViva.def'),
        to: '/presupuesto#deuda',
      },
      {
        clave: 'costeEfectivo',
        termino: t('glosario.costeEfectivo.termino'),
        def: t('glosario.costeEfectivo.def'),
        to: '/eficiencia#sec-servicios',
      },
      {
        clave: 'cantidadSinRemedir',
        termino: t('glosario.cantidadSinRemedir.termino'),
        def: t('glosario.cantidadSinRemedir.def'),
        to: '/eficiencia#sec-declaracion',
      },
      {
        clave: 'entrega',
        termino: t('glosario.entrega.termino'),
        def: t('glosario.entrega.def'),
        to: '/eficiencia#sec-entregas',
      },
    ],
    [t],
  )
}
