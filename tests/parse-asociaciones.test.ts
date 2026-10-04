import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { motivosParaNoPublicar, parseAsociacionesPdf } from '../src/scraper/asociaciones'

const text = readFileSync(join(__dirname, 'fixtures', 'asociaciones_2026-05-28.txt'), 'utf8')
const doc = parseAsociacionesPdf(text)

describe('parseAsociacionesPdf', () => {
  it('reads the register date', () => {
    expect(doc.fechaRegistro).toMatch(/2026/)
  })

  it('extracts the association rows', () => {
    expect(doc.asociaciones.length).toBeGreaterThanOrEqual(80)
    for (const a of doc.asociaciones) expect(a.nombre.length).toBeGreaterThan(2)
  })

  it('splits nombre / tipo / email on a known row', () => {
    const c = doc.asociaciones.find((a) => a.nombre.startsWith('Centro Cultural Cervantes'))!
    expect(c.tipo).toBe('Cultural')
    expect(c.email).toBe('afacundo@dib.upv.es')
    // most rows classify a tipo from the controlled vocabulary
    const typed = doc.asociaciones.filter((a) => a.tipo).length
    expect(typed).toBeGreaterThan(doc.asociaciones.length * 0.7)
  })

  const byName = (needle: string) =>
    doc.asociaciones.find((a) => a.nombre.toLowerCase().includes(needle.toLowerCase()))!

  // Lock the rewritten extractEmail branches (the plan's parser was incomplete;
  // these pin the guarded trims so a monthly re-run can't silently regress).
  it('town-strip removes only a LEADING glued town, never one inside the email', () => {
    // "…de la ciudad de Valencia" glues "Valencia" onto the email; the leading
    // town is stripped but the in-address-part "VALENCIA" is preserved.
    const a = byName('Casa Peru')
    expect(a.tipo).toBe('Cultural')
    expect(a.email).toBe('CASAPERUVALENCIA@GMAIL.COM')
  })

  it('handles the "…s/n" address tail before the email', () => {
    const a = byName('Artistas de Riba-roja')
    expect(a.email).toBe('artistasderibaroja@gmail.com')
  })

  it('reconstructs a wrapped (multi-line) row', () => {
    const a = byName('PARQUE MONTEALCEDO')
    expect(a.tipo).toBe('Vecinal')
    expect(a.email).toBe('asociacionparquemontealcedo@gmail.com')
  })

  it('KNOWN LIMITATION: an internal-word glue yields a wrong email (Wave 3.1 gazetteer)', () => {
    // "Espai Dona" + "donesmediterrania@…" glue across an internal word boundary
    // is deterministically undetectable; documented so a future fix flips this
    // assertion. The email field is OMITTED from the published snapshot for
    // exactly this reason (see scrape-asociaciones.ts).
    const a = byName('Dones de la Mediterránea')
    expect(a.email).toBe('Donadonesmediterrania@gmail.com')
  })
})

// — Registro del 9-jul-2026. El PDF estrenó una columna CIF entre «Domicilio
//   Social» y «Correo de la entidad», y pdf-parse la pega a sus dos vecinas. El
//   parser no la conocía: del 13-jul al 4-oct se publicaron domicilios con el CIF
//   pegado, líneas sueltas como entidades («G24784993», «46190 Riba-roja del
//   Túria…», «Xaranga el Minaor)») y correos dentro del nombre, que /datos pinta.
const textoJulio = readFileSync(join(__dirname, 'fixtures', 'asociaciones_2026-07-09.txt'), 'utf8')
const julio = parseAsociacionesPdf(textoJulio)
const deJulio = (inicio: string) => julio.asociaciones.find((a) => a.nombre.startsWith(inicio))

// Oráculo PROPIO, no el del parser: si la prueba importara su patrón, un patrón
// roto contaría mal en los dos lados y la prueba seguiría en verde. Cada fila de
// julio lleva un CIF, así que contarlos en el texto crudo dice cuántas entidades
// tiene el registro.
const cifsDelTexto = (textoJulio.match(/[ABCDEFGHJNPQRSUVW]-?\d{7}[0-9A-J]/g) ?? []).map((c) =>
  c.replace('-', ''),
)

describe('parseAsociacionesPdf · registro de julio (columna CIF)', () => {
  it('lee una entidad por CIF: ninguna línea suelta se publica como fila', () => {
    expect(cifsDelTexto.length).toBeGreaterThan(90) // el oráculo midió algo
    expect(julio.asociaciones.map((a) => a.cif)).toEqual(cifsDelTexto)
  })

  it('saca el CIF del domicilio cuando el correo va tras un espacio', () => {
    expect(deJulio('Centro Cultural Cervantes')).toEqual({
      nombre: 'Centro Cultural Cervantes',
      tipo: 'Cultural',
      domicilio: 'C/ Doctor Cerveró, 15. Riba-roja de Túria',
      cif: 'G46694352',
      email: 'afacundo@dib.upv.es',
    })
  })

  it('saca el CIF del correo cuando va pegado a él', () => {
    expect(deJulio('Jubilados y Pensionistas')).toEqual({
      nombre: 'Jubilados y Pensionistas de Riba-roja de Túria UDP',
      tipo: 'Social',
      domicilio: 'Miguel de Cervantes, 0 - Riba-roja de Túria',
      cif: 'G97932685',
      email: 'udp.ribarroja@gmail.com',
    })
  })

  it('reconoce el CIF con guion, el de letra V y el correo con «;» detrás', () => {
    expect(deJulio('Club Triatló')).toMatchObject({
      domicilio: 'C/ Manises nº2 pta. 3B, 46190 Riba-roja de Túria',
      cif: 'G98473978',
      email: 'ct_riba-roja@hotmail.es',
    })
    expect(deJulio('Asoc. Fiestas Valencia la Vella')).toMatchObject({
      tipo: 'Fiestas',
      domicilio: 'C/ Cactus, nº 87 Urbanización Valencia la Vella',
      cif: 'V97326037',
      email: null,
    })
    expect(deJulio('Asociación de vecinos de la Llobatera Alta')).toMatchObject({
      domicilio: 'C/ Oboe, 51. Riba-roja de Túria.',
      cif: 'G44965549',
      email: 'avbuenavistallobatera@gmail.com',
    })
  })

  it('halla el tipo tras un solo espacio aunque la palabra salga antes en el nombre', () => {
    // «Asociación Cultural TaurinaCultural Ctra. …»: el primer «Cultural » es del
    // nombre; el tipo es el que va pegado a «Taurina».
    expect(deJulio('Asociación Cultural Taurina')).toEqual({
      nombre: 'Asociación Cultural Taurina',
      tipo: 'Cultural',
      domicilio: 'Ctra. Villamarchante, 50-1Riba-roja de Túria',
      cif: 'G98409055',
      email: 'asocultaurinaribaroja@gmail.com',
    })
  })

  it('halla el tipo pegado sin espacio a los dos lados', () => {
    // «Casa PeruCulturalPere Rico, …»; el correo viene en la línea siguiente.
    expect(deJulio('Casa Peru')).toEqual({
      nombre: 'Casa Peru',
      tipo: 'Cultural',
      domicilio: 'Pere Rico, 12 de la ciudad de Valencia',
      cif: 'G06932602',
      email: 'CASAPERUVALENCIA@GMAIL.COM',
    })
  })

  it('une a su fila la línea que continúa el domicilio («46190 Riba-roja…»)', () => {
    expect(deJulio('Asociación Riba-rock')).toEqual({
      nombre: 'Asociación Riba-rock',
      tipo: 'Cultural',
      domicilio: 'C/ Villamarchante, 86-19 46190 Riba-roja del Túria',
      cif: 'G96107396',
      email: 'ribarockasociacion@gmail.com',
    })
    expect(julio.asociaciones.filter((a) => /^\d/.test(a.nombre))).toEqual([])
  })

  it('una línea con sólo el CIF, o con CIF y correo, completa su fila', () => {
    expect(deJulio('Asociación Cultural Teatral Interescena')).toEqual({
      nombre: 'Asociación Cultural Teatral Interescena',
      tipo: 'Cultural',
      domicilio: 'C/1, nº 47 (Urbanización Parque Montelcedo), Riba-roja de Túria',
      cif: 'G24784993',
      email: 'terilman7@gmail.com',
    })
    expect(deJulio("Asociación Pou d'Escoto")).toEqual({
      nombre: "Asociación Pou d'Escoto",
      tipo: 'Vecinal',
      domicilio: 'c/ Mayor 17, Riba-roja de Túria - 46190',
      cif: 'G96909601',
      email: 'avpoudescoto@gmail.com',
    })
    expect(deJulio('Club de Baloncesto Camp de Túria')).toMatchObject({
      tipo: 'Deportiva',
      cif: 'G97159131',
      email: 'rctbasquet@gmail.com',
    })
  })

  it('un nombre partido en dos líneas es una sola entidad', () => {
    expect(deJulio('Agrupación Musical Festera')).toEqual({
      nombre:
        'Agrupación Musical Festera de Riba-roja de Túria (Agrupación cultural festera Xaranga el Minaor)',
      tipo: 'Fiestas',
      domicilio: 'C/ Ramón y Cajal, 19. Riba-roja de Túria',
      cif: 'G97678999',
      email: 'amfestera@gmail.com',
    })
    expect(deJulio('Xaranga')).toBeUndefined()
  })

  it('ningún correo ni CIF se queda en el nombre o el domicilio (las dos fechas)', () => {
    // /datos pinta el nombre: un correo ahí es un correo publicado.
    for (const registro of [doc, julio]) {
      expect(registro.asociaciones.length).toBeGreaterThan(80)
      const sucias = registro.asociaciones.filter((a) =>
        [a.nombre, a.domicilio ?? ''].some((v) => v.includes('@') || /[A-Z]-?\d{8}/.test(v)),
      )
      expect(sucias).toEqual([])
    }
  })

  it('techo de fallback: casi ninguna fila se queda sin tipo (las dos fechas)', () => {
    // Un techo del 10 % no habría cazado julio: 8 de 108 filas sin tipo son un
    // 7,4 %. Con las dos fechas leídas enteras, el 2 % deja sitio a un fallo
    // honrado y a ninguno de forma.
    for (const registro of [doc, julio]) {
      const sinTipo = registro.asociaciones.filter((a) => a.tipo === null)
      expect(sinTipo.length / registro.asociaciones.length).toBeLessThan(0.02)
    }
  })
})

describe('motivosParaNoPublicar', () => {
  it('deja pasar los dos registros leídos', () => {
    expect(motivosParaNoPublicar(doc)).toEqual([])
    expect(motivosParaNoPublicar(julio)).toEqual([])
  })

  it('se niega con las filas que se publicaron del 13-jul al 4-oct', () => {
    // Copiadas tal cual de public/data/asociaciones.json (4-oct-2026).
    const publicado = {
      fechaRegistro: '09 de julio 2026',
      asociaciones: [
        {
          nombre:
            'Asociación Cultural TaurinaCultural Ctra. Villamarchante, 50-1Riba-roja de TúriaG98409055asocultaurinaribaroja@gmail.com',
          tipo: null,
          domicilio: null,
          cif: null,
          email: null,
        },
        {
          nombre: 'Centro Cultural Cervantes',
          tipo: 'Cultural',
          domicilio: 'C/ Doctor Cerveró, 15. Riba-roja de TúriaG46694352',
          cif: null,
          email: null,
        },
      ],
    }
    expect(motivosParaNoPublicar(publicado)).not.toEqual([])
  })

  it('se niega si demasiadas filas se quedan sin tipo, o si no hay ninguna', () => {
    const sinTipo = {
      ...julio,
      asociaciones: julio.asociaciones.map((a, i) => (i % 10 === 0 ? { ...a, tipo: null } : a)),
    }
    expect(motivosParaNoPublicar(sinTipo)).not.toEqual([])
    expect(motivosParaNoPublicar({ ...julio, asociaciones: [] })).not.toEqual([])
  })
})
