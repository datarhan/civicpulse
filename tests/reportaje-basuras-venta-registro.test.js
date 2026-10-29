import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { estadoEnCastellano } from '../src/pages/reportajes/Basuras'

// Dos frases de «basuras» que la revisión lectora señaló el 29-10-2026, y la
// corrección de ese día:
//
// - La sección 06 imprimía `registro.estadoPublicado` tal cual, y el lector
//   leía «seguía dando el contrato por formalized». Es la palabra de Gobierto,
//   con la que la instantánea lo guarda; la prosa dice «formalizado».
// - La sección 05, la cronología y una pregunta contaban «tres semanas» desde
//   el día en que ISS «hizo pública» la compra, el 21-10-2025. Ese día ISS la
//   COMPLETÓ, y lo hizo público el 5-11-2025 en su informe trimestral.

const snap = JSON.parse(readFileSync('public/data/reportajes/basuras.json', 'utf8'))
const fuente = readFileSync('src/pages/reportajes/Basuras.jsx', 'utf8')
// Todo lo que el lector ve salvo las notas de corrección, que citan lo retirado.
const { correcciones, ...metaSinCorrecciones } = snap.meta
const cuerpo = JSON.stringify({ ...snap, meta: metaSinCorrecciones })

describe('«basuras»: el estado del registro y el cambio de manos', () => {
  it('mide algo: la corrección que cita lo retirado está fuera del cuerpo', () => {
    expect(correcciones.length).toBeGreaterThan(0)
    expect(cuerpo.length).toBeGreaterThan(20000)
  })

  it('el estado del contrato sale en castellano, no en la palabra de Gobierto', () => {
    expect(snap.registro.estadoPublicado).toBe('formalized')
    expect(estadoEnCastellano(snap.registro.estadoPublicado)).toBe('formalizado')
    expect(fuente).not.toMatch(/\{data\.registro\.estadoPublicado\}/)
  })

  it('las tres semanas van de que ISS completó la compra a la firma', () => {
    const firma = snap.cronologia.find((c) => /formaliza el contrato con Garbialdi/.test(c.hito))
    const dias = (Date.parse(firma.fecha) - Date.parse(snap.venta.completada)) / 864e5
    expect(dias).toBe(21)
    expect(firma.hito).toMatch(/tres semanas después de que ISS completara la compra/)
    expect(snap.venta.completadaPublicadaEl > snap.venta.completada).toBe(true)
    expect(snap.venta.completadaPublicadaEl < firma.fecha).toBe(true)
  })

  it('nada da el 21 de octubre como el día en que la compra se hizo pública', () => {
    expect(cuerpo).not.toMatch(
      /hiciera pública la compra|anuncio público de ISS|publicada tres semanas antes/,
    )
    expect(fuente).not.toMatch(
      /ISS la hizo pública el 21 de octubre|se supiera que la adjudicataria/,
    )
    expect(snap.venta).not.toHaveProperty('anunciada')
  })
})
