import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SERVICIOS } from '../src/scraper/indicador-registry'
import { leerIndicador } from '../src/scraper/indicador-lectura'
import type { Indicador } from '../src/scraper/indicadores'

/**
 * El divisor tiene que tener SUJETO.
 *
 * «81.965 €/efectivo · 4.262.162 € ÷ 52 efectivo» no dice nada a un vecino:
 * «efectivo» es jerga de plantilla policial, no aparece explicada en ninguna
 * parte de la página, y para colmo colisiona con el «coste EFECTIVO» del
 * título, que significa otra cosa distinta. Lo mismo con «€/km²» (¿qué km²?),
 * «€/m de red» y «€/préstamo».
 *
 * El registro ya sabe qué cuenta cada divisor —lleva el texto literal del
 * atributo del ministerio— pero ese texto es de formulario y nunca llegaba al
 * lector. Estas pruebas exigen que cada servicio publique además la versión en
 * la lengua de un vecino, y que sea una glosa y no un eco de la unidad.
 */
const ROOT = join(__dirname, '..')
const pub = JSON.parse(readFileSync(join(ROOT, 'public/data/indicadores.json'), 'utf8'))
const indicadores: Indicador[] = pub.indicadores
const byId = (id: string) => indicadores.find((i) => i.id === id)!

describe('cada servicio dice qué cuenta su divisor', () => {
  // La lista se IMPORTA. Copiarla aquí a mano es el modo de fallo 1 de
  // docs/DATA_INTEGRITY.md: seis pruebas se quedaron verdes comprobando una
  // forma que producción ya no tenía.
  const entradas = Object.entries(SERVICIOS)

  it('el registro tiene servicios que comprobar', () => {
    // Sin esto, un registro vacío haría pasar en verde todos los bucles de
    // abajo sin evaluar ni una sola vez.
    expect(entradas.length).toBeGreaterThan(10)
  })

  it('declara singular, plural y glosa para todos', () => {
    for (const [programa, def] of entradas) {
      expect(def.divisor, `${programa} sin divisor`).toBeTruthy()
      expect(def.divisor.singular.length, `${programa} sin singular`).toBeGreaterThan(0)
      expect(def.divisor.plural.length, `${programa} sin plural`).toBeGreaterThan(0)
      expect(def.divisor.glosa.length, `${programa}: la glosa no explica nada`).toBeGreaterThan(20)
    }
  })

  it('la glosa explica, no repite el símbolo de la unidad', () => {
    // Una glosa que dijera «metros cuadrados» para «€/m²» cumpliría el largo y
    // no informaría de NADA: la pregunta del lector es qué metros cuadrados.
    for (const [programa, def] of entradas) {
      const g = def.divisor.glosa
      expect(g, `${programa}: la glosa es el símbolo otra vez`).not.toBe(def.unidad)
      expect(
        g.trim().split(/\s+/).length,
        `${programa}: la glosa es de una palabra`,
      ).toBeGreaterThan(3)
      // Y no puede ser el texto de formulario del ministerio copiado tal cual:
      // «Nº efectivos asignados al servicio» es justo lo que no se entiende.
      expect(g, `${programa}: la glosa es el atributo CE3 sin traducir`).not.toBe(def.denominador)
      expect(g.startsWith('Nº'), `${programa}: la glosa empieza como un formulario`).toBe(false)
    }
  })

  it('el plural no es el singular con una ese pegada', () => {
    // «punto de luz» → «puntos de luz» pluraliza el núcleo, no la cola, y por
    // eso el campo se cura y no se deriva. Esta prueba comprueba que el campo
    // LLEVA información: si alguien lo rellenara copiando el singular, todos
    // los pares saldrían iguales y la fórmula seguiría diciendo «52 efectivo».
    const distintos = entradas.filter(([, d]) => d.divisor.plural !== d.divisor.singular)
    expect(distintos.length, 'ningún plural difiere de su singular').toBeGreaterThan(2)
  })

  it('pluraliza la fórmula de la policía local', () => {
    // El caso que motivó esto, comprobado punta a punta contra el registro.
    const policia = SERVICIOS['b132/130P']
    expect(policia.divisor.singular).toBe('efectivo')
    expect(policia.divisor.plural).toBe('efectivos')
    expect(policia.divisor.glosa).toMatch(/plantilla|agentes|personal/i)
  })
})

describe('la frase que dice qué es el número', () => {
  it('nombra las dos cantidades, la glosa y el cociente', () => {
    // La ficha de policía local: la que el lector señaló por ilegible.
    const l = leerIndicador(byId('b132-130p-coste-unitario'))
    expect(l.que).toContain('4.262.162')
    expect(l.que).toContain('52 efectivos')
    expect(l.que).toContain('81.965')
    expect(l.que).toMatch(/plantilla|agentes|personal/i)
    // Y dice que es un gasto ANUAL: sin eso, 81.965 € se lee como un sueldo.
    expect(l.que).toMatch(/al año/)
  })

  it('no es la cifra repetida con otro formato', () => {
    // La redacción anterior era «81.965 €/efectivo en la entrega de 2024.»:
    // ocupaba el hueco de la explicación sin explicar nada, y por eso la
    // tarjeta la suprimía por redundante. Suprimir la única frase que podía
    // contestar «¿qué es esto?» dejó la página sin contestarlo en ninguna parte.
    for (const i of indicadores.filter((x) => x.valor !== null)) {
      const que = leerIndicador(i).que
      expect(
        que.split(/\s+/).length,
        `${i.id}: la frase sigue siendo un eco de la cifra`,
      ).toBeGreaterThan(15)
    }
  })

  it('la escribe para todos los cocientes publicados, no sólo para la policía', () => {
    const conValor = indicadores.filter((i) => i.valor !== null)
    expect(conValor.length).toBeGreaterThan(10)
    for (const i of conValor) {
      const que = leerIndicador(i).que
      const def = SERVICIOS[i.servicio!]
      expect(que, `${i.id} no nombra su divisor`).toContain(def.divisor.plural)
      expect(que, `${i.id} no trae la glosa`).toContain(def.divisor.glosa)
    }
  })
})
