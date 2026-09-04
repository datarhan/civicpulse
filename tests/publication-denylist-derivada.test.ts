/**
 * La lista de no publicación, derivada en vez de escrita a mano.
 *
 * `PUBLICATION_DENYLIST` tenía DOS entradas, escritas a mano, dentro de un
 * repositorio cuyo chiste recurrente es que una lista a mano se queda atrás.
 * Y se había quedado atrás: cuatro ficheros más se despliegan hoy llevando el
 * mismo campo que la lista existe para atrapar —entre ellos
 * `officials-social-suggestions.json`, que son cuentas de redes atribuidas por
 * una máquina a concejales con nombre y apellidos, sin revisar.
 *
 * La regla NO puede ser «lleva `requiresHumanApproval`». Se midió: 4.664 filas
 * con ese campo viven en los trozos de `public/data/pleno-claims/` que las
 * páginas SÍ pintan —el campo es metadato de extracción que sobrevive a la
 * puerta editorial—. Denegar por el campo a secas borraría el contenido del
 * sitio. La frase de CLAUDE.md «el esquema publicado rechaza ese campo» es
 * cierta de los tipos CURADOS (hallazgos, promesas, reportajes, cuentas), no
 * de los trozos.
 *
 * La distinción que sí aguanta es la conjunción: lleva filas pendientes de
 * aprobación Y ningún módulo del NAVEGADOR lo pide. Y «lo pide» se mide sobre
 * una ruta `/data/…` entrecomillada, no sobre una mención: `Metodologia.jsx`
 * nombra `pleno-claims-verified.json` dentro de un `<code>` para explicar la
 * tubería, y tomar esa prosa por una petición dejaría 9 MB de acusaciones sin
 * puerta editorial descargándose del sitio.
 */
import { describe, it, expect } from 'vitest'
import { esBorrador, referenciasDelNavegador, repartir } from '../publication-denylist.js'

describe('esBorrador', () => {
  it('reconoce una fila pendiente de aprobación', () => {
    expect(esBorrador('[{"id":1,"requiresHumanApproval": true}]')).toBe(true)
  })

  it('no marca un fichero cuyas filas ya están aprobadas', () => {
    expect(esBorrador('[{"id":1,"requiresHumanApproval":false}]')).toBe(false)
  })

  it('no marca un fichero limpio', () => {
    expect(esBorrador('[{"id":1,"verbatim":"x"}]')).toBe(false)
  })
})

describe('referenciasDelNavegador', () => {
  it('coge una ruta entrecomillada', () => {
    expect([...referenciasDelNavegador(["useJsonFetch('/data/quejas.json')"])]).toContain(
      '/data/quejas.json',
    )
  })

  it('coge el prefijo de una plantilla', () => {
    expect([...referenciasDelNavegador(['fetch(`/data/pleno-claims/${id}.json`)'])]).toContain(
      '/data/pleno-claims/',
    )
  })

  it('un fichero nombrado dentro de un directorio deja servido el directorio', () => {
    const r = referenciasDelNavegador(["load('/data/pleno-claims/index.json')"])
    expect([...r]).toContain('/data/pleno-claims/')
  })

  it('NO coge una mención en prosa de JSX', () => {
    // `Metodologia.jsx`: <code>pleno-claims-verified.json</code>
    const r = referenciasDelNavegador(['<code>pleno-claims-verified.json</code>'])
    expect([...r]).toEqual([])
  })

  it('descarta el prefijo desnudo `/data/`, que casaría con todo', () => {
    // Medido construyendo: algún módulo compone `/data/` + un nombre variable,
    // y con ese prefijo dentro del conjunto TODOS los borradores contaban como
    // «una página lo pide». La guarda quitaba 2 ficheros en vez de 6 y decía
    // que los otros 4 estaban servidos.
    expect([...referenciasDelNavegador(['const u = `/data/${nombre}`'])]).toEqual([])
  })

  it('NO coge una ruta escrita dentro de un comentario', () => {
    const r = referenciasDelNavegador(["// antes esto pedía '/data/viejo.json'"])
    expect([...r]).toEqual([])
  })
})

describe('repartir · cuatro suertes, nunca dos', () => {
  const referencias = new Set(['/data/quejas.json', '/data/pleno-claims/'])

  it('deniega el borrador que nadie pide', () => {
    const r = repartir({
      hojas: [{ rel: 'data/place-suggestions.json', texto: '[{"requiresHumanApproval":true}]' }],
      referencias,
    })
    expect(r.denegar).toEqual(['data/place-suggestions.json'])
  })

  it('GUARDA el borrador que vive en un directorio que el front pide', () => {
    // Los 23 trozos de pleno-claims/. Es la prueba que impide que esta regla
    // borre el contenido del sitio.
    const r = repartir({
      hojas: [{ rel: 'data/pleno-claims/1080zow.json', texto: '[{"requiresHumanApproval":true}]' }],
      referencias,
    })
    expect(r.denegar).toEqual([])
    expect(r.servidas).toEqual(['data/pleno-claims/1080zow.json'])
  })

  it('guarda el fichero limpio aunque nadie lo pida', () => {
    const r = repartir({
      hojas: [{ rel: 'data/padron.json', texto: '[{"año":2024}]' }],
      referencias,
    })
    expect(r.denegar).toEqual([])
    expect(r.limpias).toEqual(['data/padron.json'])
  })

  it('el que no se pudo leer se cuenta aparte, NUNCA como limpio', () => {
    // «No pude leerlo» y «no lleva nada» son hechos distintos, y este fichero
    // es justo el que seguiría publicándose.
    const r = repartir({ hojas: [{ rel: 'data/roto.json', texto: null }], referencias })
    expect(r.ilegibles).toEqual(['data/roto.json'])
    expect(r.limpias).toEqual([])
    expect(r.denegar).toEqual([])
  })
})
