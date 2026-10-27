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
 * @returns {{ clave: string, termino: string, def: string, to: string, propio?: boolean, mismoNombre?: boolean }[]}
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
      // Una palabra nuestra, no el nombre llano de una magnitud oficial: la
      // definición no lleva «Nombre oficial». Cada pieza guarda su registro al
      // final; la sección que lo explica para todas es cómo pedir una.
      {
        clave: 'correccion',
        termino: t('glosario.correccion.termino'),
        def: t('glosario.correccion.def'),
        to: '/metodologia#rectificacion',
        propio: true,
      },
      // El vocabulario del pleno. Las lleva a «El último pleno» de /plenos, que
      // es un orden del día de verdad partido en sus partes. Las que ya se
      // pintan con el nombre de la sede (`mismoNombre`) no repiten «Nombre
      // oficial».
      {
        clave: 'parteResolutiva',
        termino: t('glosario.parteResolutiva.termino'),
        def: t('glosario.parteResolutiva.def'),
        to: '/plenos#ultimo-pleno',
      },
      {
        clave: 'dacionDeCuenta',
        termino: t('glosario.dacionDeCuenta.termino'),
        def: t('glosario.dacionDeCuenta.def'),
        to: '/plenos#ultimo-pleno',
      },
      {
        clave: 'ruegosYPreguntas',
        termino: t('glosario.ruegosYPreguntas.termino'),
        def: t('glosario.ruegosYPreguntas.def'),
        to: '/plenos#ultimo-pleno',
        mismoNombre: true,
      },
      {
        clave: 'mocion',
        termino: t('glosario.mocion.termino'),
        def: t('glosario.mocion.def'),
        to: '/plenos#ultimo-pleno',
        mismoNombre: true,
      },
      {
        clave: 'reconocimientoExtrajudicial',
        termino: t('glosario.reconocimientoExtrajudicial.termino'),
        def: t('glosario.reconocimientoExtrajudicial.def'),
        to: '/plenos#ultimo-pleno',
      },
      {
        clave: 'sinDictaminar',
        termino: t('glosario.sinDictaminar.termino'),
        def: t('glosario.sinDictaminar.def'),
        to: '/plenos#ultimo-pleno',
        mismoNombre: true,
      },
      {
        clave: 'urgencia',
        termino: t('glosario.urgencia.termino'),
        def: t('glosario.urgencia.def'),
        to: '/plenos#ultimo-pleno',
      },
    ],
    [t],
  )
}
