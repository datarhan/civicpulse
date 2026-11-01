import { describe, it, expect } from 'vitest'
import { load } from 'js-yaml'
import { ficheros, leer, INSTALA_CHROMIUM } from './setup/workflows.js'

/**
 * ¿Tiene Playwright navegador para el sistema del runner?
 *
 * `ubuntu-latest` pasó a 26.04 y Playwright 1.59.1 no lo soporta: `playwright
 * install` muere en menos de un minuto. `e2e.yml` lo disimulaba, porque su caché
 * del navegador lleva el hash del lockfile y con ella se salta la instalación,
 * así que `main` seguía en verde y sólo caía lo que tocaba el lockfile: las PR de
 * dependencias (#514, #520). `cesel-entrega.yml` no tiene caché, así que habría
 * caído en su primer lunes de noviembre.
 *
 * El nombre móvil es el defecto: un sistema nuevo llega sin que nada cambie aquí.
 * Un trabajo que instala Chromium elige su versión de Ubuntu, y subirla es una
 * decisión con su PR. Volverá a `ubuntu-latest` sólo si esta prueba se revisa al
 * subir Playwright, y Playwright sube a mano (`.github/dependabot.yml`).
 */
const instaladores = ficheros().flatMap((f) =>
  Object.entries(load(leer(f))?.jobs ?? {})
    .filter(([, trabajo]) =>
      (trabajo?.steps ?? []).some((paso) => INSTALA_CHROMIUM.test(paso?.run ?? '')),
    )
    .map(([id, trabajo]) => ({ f, id, runner: trabajo['runs-on'] })),
)

describe('los trabajos que instalan Chromium fijan su versión de Ubuntu', () => {
  // Regla 2 de DATA_INTEGRITY: sin esto, una lista vacía pasaría todo lo de abajo.
  it('encuentra los trabajos que dice vigilar', () => {
    expect(instaladores.map(({ f, id }) => `${f}:${id}`)).toEqual(
      expect.arrayContaining([
        'e2e.yml:unidad',
        'e2e.yml:playwright',
        'nightly-scrape.yml:scrape',
        'cesel-entrega.yml:entrega',
      ]),
    )
  })

  it.each(instaladores)('$f · $id · no corre en un nombre móvil', ({ runner }) => {
    expect(runner).toMatch(/^ubuntu-\d+\.\d+$/)
  })
})
