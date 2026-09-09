import { describe, it, expect } from 'vitest'
import { buscarPrivado, resumirPrivado, type HallazgoPrivado } from '../src/scraper/privado.ts'

/**
 * ¿Se está comiteando algo NUESTRO y privado a un repositorio público?
 *
 * Distinto de `check:secrets`, y por eso es otra guarda: un secreto se reconoce
 * por su FORMA —un token de Telegram parece un token de Telegram— y esto no. La
 * referencia de la propuesta de NLnet, comiteada el 2026-09-09, no tiene forma
 * de nada: `check:secrets` la miró y dijo, con razón, que no había secretos.
 *
 * Los valores de estas pruebas son OBVIAMENTE FALSOS a propósito: una prueba que
 * alimentara la guarda con el dato real volvería a comitearlo, que es el defecto
 * que cierra. Es la misma razón por la que `check:secrets` usa claves de pega.
 *
 * EL DISCRIMINADOR ES QUE EL SUJETO SEAMOS NOSOTROS, no la palabra suelta, y
 * eso se comprueba en DOS niveles a la vez:
 *
 *   1 · la línea dice que la paga o la petición es nuestra, y
 *   2 · el FICHERO nombra a algún financiador.
 *
 * La conjunción es la señal. La primera versión de esta guarda sólo miraba la
 * línea y sacó 66 avisos sobre el árbol real, casi todos falsos: `$TMP` en un
 * script contaba como dinero, «Budget | €43.5M» —el presupuesto MUNICIPAL, que
 * es el oficio de la casa— contaba como petición nuestra, y «propia» en la nota
 * de curaduría de un concejal contaba como retribución nuestra. Cada uno de
 * esos tres está abajo como prueba, porque una guarda que llora en el contenido
 * que da sentido al proyecto se apaga el primer día.
 */

/** Un fichero realista: lo privado siempre aparece junto a un financiador. */
const conFinanciador = (linea: string) =>
  `# Plan de financiación\n\nSe presentó a NLnet en septiembre.\n${linea}\n`

const clases = (contenido: string) => buscarPrivado('f.md', contenido).map((h) => h.clase)
const clasesDe = (linea: string) => clases(conFinanciador(linea))

describe('referencia de una solicitud nuestra', () => {
  it('la caza escrita como literal', () => {
    expect(clasesDe("presentada: { fecha: '2026-09-09', ref: '2099-99-0z9' },")).toEqual([
      'referencia-solicitud',
    ])
  })

  // El arreglo del 9-sep fue justo éste, así que la guarda tiene que aprobarlo:
  // si marcara también la vía de entorno, obligaría a quitar la capacidad para
  // pasar la puerta.
  it('NO la caza cuando sale del entorno', () => {
    expect(clases('const REF = process.env.NLNET_REF?.trim() || undefined')).toEqual([])
    expect(
      clases('presentada: { fecha: 2026, ...(REF_NLNET ? { ref: REF_NLNET } : {}) },'),
    ).toEqual([])
  })

  it('no confunde una referencia de terceros con una nuestra', () => {
    // Un expediente municipal o un BOE son la materia publicable del sitio.
    expect(clases('const bases = "BOE-A-2026-15843"')).toEqual([])
    expect(clases('expediente: "101-2025"')).toEqual([])
    // Y un `ref` que no es un código no es una referencia de solicitud.
    expect(clases("const rama = { ref: 'main' }")).toEqual([])
  })

  // Falso positivo REAL de la segunda versión, y el más caro: en esta casa
  // `ref` es el campo de una CITA —la prueba documental de un hallazgo—, y sale
  // en once ficheros. Sin contexto de envío, un `ref` es evidencia, no una
  // solicitud nuestra.
  it('NO caza el `ref` de una cita, que es el esquema de pruebas de la casa', () => {
    expect(
      clasesDe("{ kind: 'tender', ref: 'https://t/1', snippet: 'expediente cotejado' }"),
    ).toEqual([])
    expect(clasesDe("crossChecked: [{ kind: 'bdns', ref: 'BDB-2026-001' }]")).toEqual([])
    expect(
      clasesDe("{ kind: 'pleno-video', ref: 'https://www.youtube.com/watch?v=abc123' }"),
    ).toEqual([])
  })

  // Lo que SÍ la distingue es el contexto de envío en la misma línea.
  it('la caza cuando la línea dice que es una solicitud presentada', () => {
    expect(clasesDe("presentada: { fecha: '2026-09-09', ref: '2099-99-0z9' },")).toEqual([
      'referencia-solicitud',
    ])
  })
})

describe('nuestra propia retribución', () => {
  it('caza el objetivo de sueldo del operador', () => {
    expect(
      clasesDe('| Funding goal | **Full-time salary** (€99–99k/yr) for the operator. |'),
    ).toEqual(['retribucion-propia'])
  })

  it('caza también en castellano', () => {
    expect(clasesDe('El salario del operador sería de 99.999 € al año.')).toEqual([
      'retribucion-propia',
    ])
  })

  // LAS PRUEBAS QUE IMPIDEN QUE ESTA GUARDA SEA INSERVIBLE. El sitio publica lo
  // que cobran los cargos electos: es dato de interés público sobre terceros
  // identificados, no información nuestra.
  it('NO caza el sueldo de un concejal, que es el oficio de la casa', () => {
    expect(
      clasesDe('Retribución del cargo: 45.000 € brutos anuales (dedicación exclusiva).'),
    ).toEqual([])
    expect(clasesDe('| Alcalde | dedicación exclusiva | 52.000 € |')).toEqual([])
    expect(clasesDe('Las dedicaciones de la corporación suman 312.000 € al año.')).toEqual([])
  })

  // Falso positivo REAL de la primera versión, sobre `journalist-reports.json`:
  // «propia» en una nota de curaduría sobre un concejal no nos convierte en el
  // sujeto. Por eso «propio/nuestro» no valen como marca de que somos nosotros.
  it('NO caza «retribución propia» dicho de un tercero', () => {
    expect(
      clasesDe(
        '"curatorNotes": "Revisión: su retribución propia del cargo, 45.000 €, se cotejó con el CV."',
      ),
    ).toEqual([])
  })
})

describe('el importe que pedimos', () => {
  it('caza una petición en primera persona con su cifra', () => {
    expect(clasesDe('Pedimos 99.999 € a NLnet, repartidos en cinco paquetes.')).toEqual([
      'importe-solicitado',
    ])
    expect(clasesDe('Funding goal: 99.999 € para doce meses.')).toEqual(['importe-solicitado'])
  })

  // El calendario del bot lista DIEZ convocatorias con las cifras que publica
  // cada convocante. Eso es hecho público de un tercero y tiene que pasar.
  it('NO caza el importe que publica quien convoca', () => {
    expect(clasesDe("nota: 'tres premios (5.000/3.000/2.000 €)'")).toEqual([])
    expect(clasesDe('El premio consiste en una dotación de 3.000 €.')).toEqual([])
    expect(clasesDe('Reparte 1,4 M€ entre medios de interés público.')).toEqual([])
  })

  // Falso positivo REAL de la primera versión, sobre `docs/REAL_DATA_MVP_PLAN.md`:
  // «Budget» a secas es el PRESUPUESTO MUNICIPAL, que es exactamente lo que este
  // sitio publica. La palabra sola no puede significar «lo que pedimos».
  it('NO caza el presupuesto municipal', () => {
    expect(clasesDe('| 2 | Budget | €43.5M / 9+9+6 chapters | MinHac CONPREL XLS |')).toEqual([])
    expect(
      clasesDe('El presupuesto municipal de 2026 asciende a 37,60 M€ de crédito inicial.'),
    ).toEqual([])
  })

  // Falso positivo REAL de la primera versión: `$` de una variable de shell
  // contaba como dinero, así que cualquier línea de script con una cifra pasaba
  // a ser «un importe».
  it('NO confunde una variable de shell con dinero', () => {
    expect(
      clasesDe("node -e \"const fs=require('fs');(async()=>{for(const f of ['$TMP/g.pdf'])})\""),
    ).toEqual([])
    expect(clasesDe('export TMP=$HOME/tmp && mkdir -p $TMP/2026')).toEqual([])
  })
})

describe('el fichero tiene que hablar de financiación', () => {
  // Sin financiador en el fichero, una línea sobre sueldos es de otra cosa. Es
  // la mitad del discriminador y sin ella vuelven los 66 avisos.
  it('la misma línea NO se marca en un fichero que no nombra financiadores', () => {
    const suelto = 'El salario del operador sería de 99.999 € al año.\n'
    expect(buscarPrivado('otro.md', suelto)).toEqual([])
    expect(clases(conFinanciador(suelto))).toEqual(['retribucion-propia'])
  })

  // Y el corolario que salva al calendario del bot: nombra DIEZ convocatorias y
  // ninguna cifra nuestra, así que no puede marcarse.
  it('un calendario de convocatorias públicas no se marca', () => {
    const calendario = [
      "{ id: 'nlnet', nombre: 'NLnet — Other/open call', cierra: '2026-11-03' },",
      "{ id: 'goteo', nombre: 'Goteo — micromecenazgo', continua: true },",
      "nota: 'El premio consiste en una dotación de 3.000 €.',",
      "nota: 'Reparte 1,4 M€ entre medios de interés público en desiertos informativos.',",
    ].join('\n')
    expect(buscarPrivado('bot/src/services/convocatorias.ts', calendario)).toEqual([])
  })
})

describe('resumirPrivado', () => {
  it('cuenta por clase y bloquea si hay algo', () => {
    const h: HallazgoPrivado[] = buscarPrivado(
      'f.ts',
      conFinanciador("presentada: { ref: '2099-99-0z9' },"),
    )
    const r = resumirPrivado(h, 1)
    expect(r.hallazgos).toBe(1)
    expect(r.porClase['referencia-solicitud']).toBe(1)
    expect(r.bloquea).toBe(true)
  })

  // Regla 2 de DATA_INTEGRITY: cero hallazgos sobre cero ficheros no es un visto
  // bueno, es una pasada que no hizo nada. `check:secrets` ya lo distingue y
  // esta guarda no puede ser más laxa que la que copia.
  it('cero sobre cero ficheros NO es concluyente', () => {
    expect(resumirPrivado([], 0).concluyente).toBe(false)
    expect(resumirPrivado([], 0).bloquea).toBe(false)
    expect(resumirPrivado([], 12).concluyente).toBe(true)
  })

  it('dice en qué línea, para poder arreglarlo sin buscar', () => {
    // La línea 4: tres de cabecera en `conFinanciador` y la nuestra la cuarta.
    const h = buscarPrivado('docs/x.md', conFinanciador("presentada: { ref: '2099-99-0z9' },"))
    expect(h[0].linea).toBe(4)
    expect(h[0].fichero).toBe('docs/x.md')
  })
})
