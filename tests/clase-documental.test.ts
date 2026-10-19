import { describe, it, expect } from 'vitest'
import {
  CLASES_DOCUMENTALES,
  CLASES_PEDIBLES,
  claseDocumentalDe,
  agruparPorClaseDocumental,
} from '../src/scraper/clase-documental'

/**
 * Propiedad LÉXICA, nunca un pronóstico.
 *
 * Esto mide qué documento NOMBRA una frase. No dice si la frase se puede
 * comprobar, ni si el documento existe, ni si el Ayuntamiento lo tiene. La
 * distinción es la misma que `classifyClaimShape` ya sostiene en la cola de
 * apoyo, y es lo único que hace defendible clasificar 4.293 filas sin que un
 * modelo adivine nada.
 *
 * La regla que más importa: una frase que no nombra ningún documento se cuenta
 * APARTE y no se reparte entre las clases. Son el 87 % del corpus sin corpus, y
 * repartirlas haría que cualquier clase pareciera mayor de lo que es — que es
 * exactamente cómo se justifica una petición que no sostiene el material.
 */
describe('claseDocumentalDe · qué documento nombra la frase', () => {
  it('reconoce las clases que se pueden pedir', () => {
    expect(claseDocumentalDe('visto el informe conjunto con la Secretaría')).toContain(
      'informe-tecnico',
    )
    expect(claseDocumentalDe('por acuerdo plenario del 9 de febrero')).toContain('acta')
    expect(claseDocumentalDe('el expediente de la minimización')).toContain('expediente')
    expect(claseDocumentalDe('modificación plan de inversiones')).toContain('plan-interno')
  })

  it('una frase puede nombrar más de un documento', () => {
    const c = claseDocumentalDe('están en el informe y luego en el acuerdo plenario')
    expect(c).toContain('informe-tecnico')
    expect(c).toContain('acta')
  })

  it('la que no nombra ninguno devuelve vacío — no se le adjudica una clase', () => {
    expect(claseDocumentalDe('no está gestionando como toca')).toEqual([])
    expect(claseDocumentalDe('Vox dice que no, que no')).toEqual([])
    expect(claseDocumentalDe('')).toEqual([])
  })

  it('agrupa sin repartir lo que no nombra nada', () => {
    const r = agruparPorClaseDocumental([
      'visto el informe conjunto',
      'el expediente de contratación',
      'no está gestionando como toca',
      'Vox dice que no',
    ])
    expect(r.porClase['informe-tecnico']).toBe(1)
    expect(r.porClase['expediente']).toBe(1)
    // Las dos sin documento van a su propio contador, no a las clases.
    expect(r.sinDocumento).toBe(2)
    const sumaClases = Object.values(r.porClase).reduce((a, n) => a + n, 0)
    expect(sumaClases).toBe(2)
  })

  it('las clases PEDIBLES son un subconjunto declarado de las clases', () => {
    // `contrato` y `presupuesto` se nombran mucho pero YA tenemos corpus de
    // ellos: ahí el hueco es de emparejamiento, no de publicación, y pedirlos
    // sería pedir algo que ya está publicado.
    for (const c of CLASES_PEDIBLES) expect(CLASES_DOCUMENTALES).toContain(c)
    expect(CLASES_PEDIBLES).not.toContain('contrato')
    expect(CLASES_PEDIBLES).not.toContain('presupuesto')
  })

  it('el enum se exporta, no se recita', () => {
    expect([...CLASES_PEDIBLES].sort()).toEqual(
      ['acta', 'expediente', 'informe-tecnico', 'plan-interno'].sort(),
    )
  })
})

/**
 * «En el pleno» no es nombrar un acta.
 *
 * El patrón de `acta` casaba «en el pleno» y «pleno celebrado» sueltos, que son
 * habla corriente en una sesión plenaria. El 19-10-2026, 7 de las 16
 * declaraciones publicadas que la tabla de solicitudes contaba como
 * dependientes de un acta casaban sólo por eso: dos hablaban del tiempo de
 * palabra («cada hora invertida en el pleno»), y cinco citaban un acuerdo de un
 * pleno anterior con su fecha. Las segundas sí dependen del acta de esa sesión;
 * las primeras no nombran ningún documento. Las frases son las publicadas.
 */
describe('claseDocumentalDe · el acta, sólo con una sesión fechada', () => {
  it('el pleno como lugar donde se habla no nombra ningún acta', () => {
    for (const frase of [
      'lo normal es que de cada hora invertida en el pleno lo normal 20 minutos sean para el alcalde',
      'lo normal es que el 30% del tiempo ocupado en el pleno sea por los diálogos que tenemos con el señor alcalde',
      'como ya dije en el pleno',
      'el último pleno celebrado aquí',
    ]) {
      expect(claseDocumentalDe(frase), frase).not.toContain('acta')
    }
  })

  it('una sesión anterior con su fecha sí depende de su acta', () => {
    for (const frase of [
      'Ya en el pleno celebrado el 3 de junio de 2024 acordamos la adhesión al convenio marco de colaboración entre la Generalitat,',
      'En el Pleno de febrero del 21 se acuerda la suspensión del procedimiento de contratación del servicio dada la sentencia.',
      'en el pleno de 1 de diciembre de 2025 iniciamos el expediente de resolución de oficio de la adjudicación',
      'En el Pleno de febrero nos pusimos un plazo de un año ampliable, incluso a dos',
      'en el pleno ordinario de marzo se aprobó',
      'el pleno celebrado el día 12 aprobó la moción',
    ]) {
      expect(claseDocumentalDe(frase), frase).toContain('acta')
    }
  })

  it('lo que ya casaba por su nombre sigue casando', () => {
    expect(claseDocumentalDe('Acuerdo Plenario de fecha 26 de septiembre de 2016')).toContain(
      'acta',
    )
    expect(claseDocumentalDe('realizándose un acta pormenorizada de dicha reunión')).toContain(
      'acta',
    )
    expect(claseDocumentalDe('según el acuerdo del pleno')).toContain('acta')
  })
})
