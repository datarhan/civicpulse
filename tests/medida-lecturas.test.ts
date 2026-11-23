// @vitest-environment happy-dom
/**
 * La medida de las dos lecturas (`tests/e2e/_medida-lecturas.ts`), sobre un DOM
 * hecho a mano: lo que se puede probar sin maquetar. Lo que depende de la
 * maqueta (en qué pantalla cae una frase) sólo lo mide un navegador, en
 * `medida-lecturas.spec.ts`; happy-dom da cero a todo `getBoundingClientRect`.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { JARGON, medirLecturas } from './e2e/_medida-lecturas'

const mide = () => medirLecturas({ jerga: JARGON, alto: 629 })

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('la lista de jerga', () => {
  it('es la de la auditoría, sin perder ninguna', () => {
    expect(JARGON).toContain('obligaciones reconocidas')
    expect(JARGON).toContain('competencia delegada')
    expect(JARGON.length).toBe(31)
    expect(new Set(JARGON).size).toBe(JARGON.length)
  })
})

describe('jerga y siglas sin su enlace al glosario', () => {
  it('cuenta un término fuera del botón y no el de dentro', () => {
    document.body.innerHTML = `
      <main>
        <section data-lectura-vecinal="">
          <p class="cp-en-breve-frase">Las
            <button class="cp-termino">obligaciones reconocidas</button> suben.
            La licitación sigue abierta.</p>
        </section>
        <p>Fuera de la capa vecinal: licitación, CONPREL.</p>
      </main>`
    const m = mide()
    expect(m.capas).toBe(1)
    expect(m.jergaSinEnlace).toEqual(['licitación'])
  })

  it('una sigla del glosario no se cuenta dentro de otra palabra', () => {
    document.body.innerHTML = `
      <main><p data-lectura-vecinal="">Una idea de la UTE y del PMP.</p></main>`
    // «DEA» no está en «idea»; «UTE» y «PMP» sí son las siglas, sueltas.
    expect(mide().jergaSinEnlace.sort()).toEqual(['PMP', 'UTE'])
  })

  it('cuenta siglas sin enlace, y no las de un <abbr title> ni las del botón', () => {
    document.body.innerHTML = `
      <main><p data-lectura-vecinal="">El IVA, el
        <abbr title="Boletín Oficial de la Provincia">BOP</abbr> y la
        <button class="cp-termino">RPT</button>.</p></main>`
    expect(mide().siglasSinEnlace).toEqual(['IVA'])
  })
})

describe('la cifra de cada tarjeta contra su detalle', () => {
  const pagina = (detalle: string, cifra = 'data-cifra="ejecutado" data-cifra-valor="100"') => `
    <main>
      <section data-lectura-vecinal="" data-en-breve-bloque="">
        <article data-en-breve="gastado">
          <span class="cp-en-breve-cifra" ${cifra}>100 €</span>
          <a href="#cascada" class="cp-en-breve-ancla">Ver</a>
        </article>
        <article data-en-breve="cuantos">
          <span class="cp-en-breve-cifra">12</span>
          <a href="#otra" class="cp-en-breve-ancla">Ver</a>
        </article>
      </section>
      <div id="cascada">${detalle}</div>
    </main>`

  it('coincide, sin marcar', () => {
    document.body.innerHTML = pagina('<div data-cifra="ejecutado" data-cifra-valor="100"></div>')
    expect(mide().cifras).toEqual([
      { tarjeta: 'gastado', clave: 'ejecutado', estado: 'coincide' },
      { tarjeta: 'cuantos', clave: null, estado: 'sin-marcar' },
    ])
  })

  it('no coincide cuando el detalle dice otro valor', () => {
    document.body.innerHTML = pagina('<div data-cifra="ejecutado" data-cifra-valor="99"></div>')
    expect(mide().cifras[0].estado).toBe('no-coincide')
  })

  it('sin pareja cuando el ancla no tiene esa cifra', () => {
    document.body.innerHTML = pagina('<div data-cifra="definitivo" data-cifra-valor="100"></div>')
    expect(mide().cifras[0].estado).toBe('sin-pareja')
  })

  it('una pareja fuera del ancla no cuenta', () => {
    document.body.innerHTML =
      pagina('') + '<div data-cifra="ejecutado" data-cifra-valor="100"></div>'
    expect(mide().cifras[0].estado).toBe('sin-pareja')
  })
})
