/**
 * Una promesa «Documentada» sin evidencia curada tiene que DECIR que no la hay.
 *
 * La tarjeta pintaba la sección «Evidencia curada» sólo si había filas
 * (`p.evidence.length > 0 &&`), así que una promesa sin ninguna no enseñaba ni
 * la sección ni su ausencia: debajo del estado venía directamente el bloque del
 * motor —«PROPUESTA AUTOMÁTICA · PENDIENTE DE REVISIÓN HUMANA · CONFIANZA 18 %
 * · No está publicada»—, y eso es lo único que el lector encuentra bajo la
 * palabra «Documentada».
 *
 * La revisión lectora del 16-09-2026 lo señaló tres veces en /promesas, y al
 * cotejarlo con el dato tenía razón en lo que importa: las tres llevan
 * `status: documentada` con `evidence: []`, mientras las tarjetas vecinas que
 * sí enseñan «EVIDENCIA CURADA» son `en-progreso` con su fila. El silencio se
 * lee como respaldo — es el defecto de `check:area-fit` otra vez: «un área sin
 * firmar deja SILENCIO y el silencio se lee como limpio».
 *
 * `documentada` es el estado DÉBIL de este registro (`V1_STATUSES` en
 * `src/scraper/promises.ts`): dice que la promesa está recogida con su fuente,
 * no que su ejecución esté acreditada. La tarjeta tiene que decir eso donde el
 * lector lo busca, no sólo en la entradilla de la página.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MemoryRouter } from 'react-router-dom'

import { PromiseCard } from '../../src/pages/Promesas'
import { V1_STATUSES } from '../../src/scraper/promises'
import { invalidateSnapshots } from '../../src/lib/snapshot-store'

const ROOT = join(__dirname, '..', '..')
const PROMESAS = JSON.parse(readFileSync(join(ROOT, 'public/data/promises.json'), 'utf8'))
const LINK_ROT = JSON.parse(readFileSync(join(ROOT, 'public/data/press-link-rot.json'), 'utf8'))

/** Las URL que el auditor da por muertas y sin copia archivada. */
const SIN_FUENTE = new Set(
  LINK_ROT.items.filter((r) => r.status === 'dead' && !r.archivedUrl).map((r) => r.articleUrl),
)
const sinFuente = (p) => SIN_FUENTE.has(p.source?.url)
const sinEv = (p) => (p.evidence ?? []).length === 0

const sinEvidencia = PROMESAS.items.find((p) => sinEv(p) && !sinFuente(p))
const sinEvidenciaNiFuente = PROMESAS.items.find(
  (p) => sinEv(p) && sinFuente(p) && V1_STATUSES.has(p.status),
)
const conEvidencia = PROMESAS.items.find((p) => (p.evidence ?? []).length > 0)

const realFetch = globalThis.fetch
beforeEach(() => {
  // La salud de las citas se sirve de verdad: sin ella, `citationStatus` no
  // sabe de ningún enlace roto y la rama que esta prueba vigila no se pinta
  // nunca — verde sin medir.
  globalThis.fetch = async (url) =>
    String(url).endsWith('/data/press-link-rot.json')
      ? new Response(JSON.stringify(LINK_ROT), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      : new Response('not found', { status: 404 })
  invalidateSnapshots()
})
afterAll(() => {
  globalThis.fetch = realFetch
  invalidateSnapshots()
  cleanup()
})

const pinta = (p) =>
  render(
    <MemoryRouter>
      <PromiseCard p={p} suggestion={null} llmEvidence={null} frozen={false} />
    </MemoryRouter>,
  )

const plano = (c) => c.container.textContent.replace(/\s+/g, ' ')

describe('una promesa sin evidencia curada dice que no la hay', () => {
  it('mide algo: el fichero publicado trae los dos casos', () => {
    // Sin los dos lados, «sale el aviso» y «no sale» podrían estar midiendo lo
    // mismo. Y el caso sin evidencia tiene que ser uno de los estados débiles,
    // que es de lo que habla el aviso.
    expect(sinEvidencia, 'ninguna promesa publicada carece de evidencia').toBeTruthy()
    expect(conEvidencia, 'ninguna promesa publicada trae evidencia').toBeTruthy()
    expect(V1_STATUSES.has(sinEvidencia.status)).toBe(true)
    expect(
      sinEvidenciaNiFuente,
      'ninguna promesa publicada junta estado débil, cero evidencia y fuente muerta sin copia',
    ).toBeTruthy()
  })

  it('lo dice donde iría la evidencia, y explica qué NO afirma «Documentada»', () => {
    const c = pinta(sinEvidencia)
    const texto = plano(c)
    expect(texto).toMatch(/Sin evidencia curada/i)
    // Y dice qué significa el estado, que es lo que el lector estaba leyendo mal.
    expect(texto).toMatch(/no que su ejecución esté acreditada/i)
    cleanup()
  })

  it('un estado fuerte sin evidencia no se explica con la glosa del débil', () => {
    // La glosa habla de lo que «Documentada» NO afirma, así que sólo vale para
    // los estados débiles. Con otro estado la tarjeta dice la ausencia y punto:
    // una frase verdadera para un caso y falsa para el de al lado es la avería
    // que este repositorio llama «una ficha de hechos enumera, no concluye».
    const otro = { ...sinEvidencia, status: 'en-progreso' }
    const texto = plano(pinta(otro))
    expect(texto).toMatch(/Sin evidencia curada/i)
    expect(texto).toMatch(/Ningún documento curado acredita todavía su ejecución/i)
    expect(texto).not.toMatch(/no que su ejecución esté acreditada/i)
    cleanup()
  })

  it('con la fuente muerta y sin copia, NO dice que esté recogida con su fuente', async () => {
    // Lo cazó la revisión lectora sobre el propio arreglo: la tarjeta avisa dos
    // líneas antes de que el enlace está roto y sin copia archivada, y la glosa
    // venía detrás dando la fuente por consultable.
    const c = pinta(sinEvidenciaNiFuente)
    await waitFor(() => {
      expect(plano(c)).toMatch(/enlace roto · sin copia archivada/i)
    })
    const texto = plano(c)
    expect(texto).toMatch(/su fuente ya no se puede consultar/i)
    expect(texto).not.toMatch(/está recogida con su fuente/i)
    cleanup()
  })

  it('la que sí la tiene enseña su evidencia y NO el aviso (el control)', () => {
    const c = pinta(conEvidencia)
    const texto = plano(c)
    expect(texto).toMatch(/Evidencia curada/i)
    expect(texto).not.toMatch(/Sin evidencia curada/i)
    cleanup()
  })
})
