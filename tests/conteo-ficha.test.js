import { describe, it, expect } from 'vitest'
import { conteoFicha } from '../src/lib/conteo-ficha'

// La ficha de un concejal (/cargos/:slug) contaba sobre `data ?? []`: mientras
// plenos-agendas.json o promises.json cargaban, o si fallaban, pintaba «Puntos
// en pleno 0» y «Sin promesas documentadas para este grupo» junto al nombre de
// una persona. Un cero que significa «todavía no lo sé» es el centinela
// publicado como valor.
const contar = (d) => d.items.length

describe('lib/conteo-ficha — conteoFicha', () => {
  it('mientras carga no hay cifra', () => {
    expect(conteoFicha({ loading: true, error: null, data: null }, contar)).toEqual({
      estado: 'cargando',
    })
  })

  it('un error no es un cero', () => {
    expect(conteoFicha({ loading: false, error: new Error('red'), data: null }, contar)).toEqual({
      estado: 'no-disponible',
    })
  })

  it('sin datos y sin carga en curso, tampoco', () => {
    expect(conteoFicha({ loading: false, error: null, data: null }, contar)).toEqual({
      estado: 'no-disponible',
    })
    expect(conteoFicha(undefined, contar)).toEqual({ estado: 'cargando' })
  })

  it('un fichero que no tiene la forma esperada no se cuenta como vacío', () => {
    expect(conteoFicha({ loading: false, error: null, data: {} }, contar)).toEqual({
      estado: 'no-disponible',
    })
  })

  it('leído, da la cuenta — cero incluido, que ahora sí es un cero', () => {
    const res = (items) => ({ loading: false, error: null, data: { items } })
    expect(conteoFicha(res([1, 2, 3]), contar)).toEqual({ estado: 'listo', n: 3 })
    expect(conteoFicha(res([]), contar)).toEqual({ estado: 'listo', n: 0 })
  })

  // Quien no tiene áreas delegadas no tiene puntos en sus áreas: ese cero es
  // cierto antes de leer nada, y esperar al fichero sólo lo retrasaría.
  it('un cero cierto de antemano no espera al fichero', () => {
    const cargando = { loading: true, error: null, data: null }
    const roto = { loading: false, error: new Error('red'), data: null }
    expect(conteoFicha(cargando, contar, { ceroCierto: true })).toEqual({ estado: 'listo', n: 0 })
    expect(conteoFicha(roto, contar, { ceroCierto: true })).toEqual({ estado: 'listo', n: 0 })
  })
})
