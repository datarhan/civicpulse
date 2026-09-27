import { describe, it, expect } from 'vitest'
import { RESPONSE_BLOCS } from '../src/scraper/journalist'
import { quienReplica } from '../src/scraper/journalist/replica'

/**
 * Quién firma una réplica a un informe del agente, con un nombre y no con una
 * clave.
 *
 * EL FALLO, medido el 2026-09-27: la página del informe titulaba la réplica
 * `Réplica de ${response.from}` y el «alma» exportada a public/data/souls/ la
 * firmaba `**${response.from}**`. Con `person` habrían publicado «Réplica de
 * person»; con `Otro`, «Réplica de Otro», un centinela impreso como si fuera un
 * nombre (regla 3 de DATA_INTEGRITY). `Otro` sale del enum; `person` pasa a
 * significar la persona de la que trata el informe, y se escribe con su nombre.
 * Un mantenedor comprueba el origen de cada réplica antes de publicarla, así que
 * nadie firma como la persona del informe sin serlo.
 */
describe('quienReplica', () => {
  it('un grupo se nombra a sí mismo', () => {
    expect(quienReplica('PSOE', 'Robert Raga Gadea')).toBe('PSOE')
    expect(quienReplica('EU-Podem', null)).toBe('EU-Podem')
  })

  it('`person` es la persona del informe, con su nombre', () => {
    expect(quienReplica('person', 'Robert Raga Gadea')).toBe('Robert Raga Gadea')
  })

  it('sin nombre conocido, una descripción, nunca la clave', () => {
    expect(quienReplica('person', undefined)).toBe('la persona del informe')
    expect(quienReplica('person', '  ')).toBe('la persona del informe')
  })

  it('ningún valor admitido se publica como clave', () => {
    // Recorre el enum del validador, no una copia: si alguien vuelve a meter un
    // centinela, esto lo ve.
    expect(RESPONSE_BLOCS.length).toBeGreaterThan(1)
    expect(RESPONSE_BLOCS).not.toContain('Otro')
    for (const from of RESPONSE_BLOCS) {
      for (const nombre of ['Robert Raga Gadea', undefined]) {
        expect(quienReplica(from, nombre)).not.toMatch(/^(person|Otro)$/)
      }
    }
  })
})
