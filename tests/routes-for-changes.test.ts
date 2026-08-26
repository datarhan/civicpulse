import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { construirGrafoRutas } from '../scripts/lib/route-graph'
import { rutasDeFichero, ordenarPorCentralidad } from '../scripts/routes-for-changes'

const ROOT = join(__dirname, '..')
const grafo = construirGrafoRutas(join(ROOT, 'src'))
const rutas = (f: string) => rutasDeFichero(f, grafo).sort()

describe('qué rutas toca un cambio', () => {
  it('una página lleva a su propia ruta', () => {
    expect(rutas('src/pages/Eficiencia.jsx')).toContain('/eficiencia')
    expect(rutas('src/pages/Gestion.jsx')).toContain('/gestion')
  })

  it('un componente hoja lleva sólo a donde se monta', () => {
    // SerieServicio la pintan la ficha de un servicio y el libro que lleva a
    // ella: dos rutas, las dos de eficiencia. Si esto empieza a devolver media
    // docena, el grafo se ha vuelto borroso y el gancho revisará de más — que
    // acaba siendo revisar de menos, porque el presupuesto se lo come otra
    // ruta.
    expect(rutas('src/components/eficiencia/SerieServicio.jsx')).toEqual([
      '/eficiencia',
      '/eficiencia/:id',
    ])
  })

  it('un comentario que MENCIONA un snapshot no lo DECLARA', () => {
    // `useJsonFetch.js` documenta su parámetro con el ejemplo
    // «e.g. '/data/padron.json'», y lo importa prácticamente cada hook. Leído
    // como declaración, eso le colgaba a padron.json TREINTA Y CUATRO rutas:
    // cada vez que el padrón se refrescaba, el recordatorio de prosa rancia
    // nombraba media web. Un recordatorio así es el que la gente apaga.
    //
    // Padrón lo cargan dos sitios y sólo dos: /datos (usePadron) y /lab-health
    // (que lo lista en su tabla de bytes). Si esto vuelve a crecer, alguien ha
    // dejado de quitar comentarios antes de casar literales.
    expect(rutas('public/data/padron.json')).toEqual(['/datos', '/lab-health'])
  })

  it('un snapshot lleva a las páginas que lo cargan Y a las que lo describen', () => {
    const r = rutas('public/data/indicadores.json')
    expect(r).toContain('/eficiencia')
    expect(r).toContain('/gestion')
    // /metodologia no lo carga: lo declara con el marcador `prosa-describe`, y
    // es justo la página donde una cifra vieja es peor.
    expect(r).toContain('/metodologia')
  })

  it('coincide con el mapa committeado, que sale del mismo grafo', () => {
    // Cross-check: dos consumidores del mismo recorrido no pueden discrepar.
    const mapa = JSON.parse(readFileSync(join(ROOT, '.claude/hooks/prosa-map.json'), 'utf8')) as {
      snapshots: Record<string, string[]>
    }
    const nombres = Object.keys(mapa.snapshots)
    expect(nombres.length).toBeGreaterThan(0)
    for (const snap of nombres) {
      expect(rutas(`public/data/${snap}`), `${snap} discrepa del mapa de prosa`).toEqual(
        [...mapa.snapshots[snap]].sort(),
      )
    }
  })

  it('lo que no toca ninguna página no devuelve ninguna ruta', () => {
    expect(rutas('docs/OPERATIONS.md')).toEqual([])
    expect(rutas('scripts/check-indicadores.ts')).toEqual([])
    expect(rutas('')).toEqual([])
  })

  it('no devuelve todo para todo', () => {
    // EL CONTROL. Sin él, un `rutasDeFichero` que devolviera siempre las
    // veintitantas rutas pasaría todas las pruebas de arriba, y el gancho
    // volvería a repartir su presupuesto entre rutas que nadie tocó — que es
    // exactamente la avería que esto viene a arreglar.
    const hoja = rutas('src/components/eficiencia/SerieServicio.jsx')
    const global = rutas('src/i18n.jsx')
    expect(hoja.length).toBeLessThan(global.length)
    expect(global.length).toBeGreaterThan(5)
    expect(hoja.length).toBeLessThanOrEqual(2)
  })

  it('toda ruta que devuelve está montada de verdad', () => {
    // Una ruta inventada haría que el gancho pidiera una página que da 404, y
    // una página vacía se revisa «limpia».
    const montadas = new Set(grafo.rutas)
    expect(montadas.size).toBeGreaterThan(10)
    for (const f of [
      'src/i18n.jsx',
      'src/pages/Eficiencia.jsx',
      'public/data/indicadores.json',
      'public/data/pleno-findings.json',
    ]) {
      for (const r of rutas(f)) {
        expect(montadas.has(r), `${f} devuelve ${r}, que no está montada`).toBe(true)
      }
    }
  })
})

describe('el armazón y la hoja global alcanzan TODAS las rutas', () => {
  // Dos clases enteras de cambio no disparaban ninguna revisión, y las dos son
  // de las que más rompen. Medido el 26-08-2026, con un defecto real dentro:
  // esa sesión reescribió `src/index.css` a fondo y `useHashScroll.js` estaba
  // colocando los anclas 80 px por encima de su sitio; los dos devolvían CERO.
  const publicas = rutas('src/pages/Eficiencia.jsx').length

  it('una hoja de estilos global mapea a las rutas públicas, no a ninguna', () => {
    // `ficheros()` filtraba por /\.(jsx?|tsx?)$/, así que el CSS no existía
    // para el grafo. Y una hoja global no cuelga de una página: se importa una
    // vez en la raíz y alcanza el sitio entero.
    expect(rutas('src/index.css').length).toBeGreaterThan(20)
  })

  it('un módulo del armazón también', () => {
    for (const f of [
      'src/hooks/useHashScroll.js',
      'src/components/Sidebar.jsx',
      'src/components/Topbar.jsx',
      'src/i18n.jsx',
    ]) {
      expect(rutas(f).length, `${f} no alcanza el armazón entero`).toBeGreaterThan(20)
    }
  })

  it('EL CONTROL: seguir alcanzando todo no puede ser el caso de todos', () => {
    // Sin esto, un grafo que devolviera las treinta para cualquier fichero
    // pasaría las dos pruebas de arriba — y el gancho repartiría su presupuesto
    // entre rutas que nadie tocó, que es la avería original con otra cara.
    expect(publicas).toBe(1)
    expect(rutas('src/components/eficiencia/SerieServicio.jsx').length).toBe(2)
  })
})

describe('la centralidad ordena por lo que el push reescribió', () => {
  const orden = (fs: string[]) => ordenarPorCentralidad(fs, grafo)

  it('el módulo de una página sale DIRECTA; un import compartido, no', () => {
    const r = orden(['src/pages/Eficiencia.jsx', 'src/i18n.jsx'])
    expect(r.detalle.find((d) => d.ruta === '/eficiencia')?.directa).toBe(true)
    // i18n alcanza el sitio entero y no es «de» ninguna ruta. Si esto se
    // volviera directa, `--rotate-desde N` congelaría media lista y la cola
    // dejaría de leerse: N es el número de directas.
    for (const d of r.detalle.filter((x) => x.ruta !== '/eficiencia')) {
      expect(d.directa, `${d.ruta} no debería ser directa`).toBe(false)
    }
    expect(r.directas).toBe(1)
  })

  it('las directas van primero, y las N primeras son exactamente ésas', () => {
    const r = orden(['src/i18n.jsx', 'src/pages/Eficiencia.jsx', 'src/pages/Datos.jsx'])
    expect(r.rutas.slice(0, r.directas).sort()).toEqual(['/datos', '/eficiencia'])
    // El contrato que el gancho consume: pasa `r.directas` a `--rotate-desde`,
    // así que la cabeza intacta TIENE que ser el prefijo de la lista.
    expect(r.directas).toBe(2)
  })

  it('el fan-out inverso pesa más lo específico que lo global', () => {
    const r = orden(['src/i18n.jsx', 'src/components/eficiencia/SerieServicio.jsx'])
    const efi = r.detalle.find((d) => d.ruta === '/eficiencia')!
    const otra = r.detalle.find((d) => d.ruta === '/datos')!
    // SerieServicio aporta 1/2 a /eficiencia; i18n aporta 1/30 a cada una.
    expect(efi.peso).toBeGreaterThan(otra.peso * 5)
    expect(r.rutas[0]).toBe('/eficiencia')
  })

  it('sobre el diff que falló: /eficiencia primera, no la última de diecinueve', () => {
    // El caso real, con los ficheros de la Revisión Eficiencia. Antes de esto
    // el lector gastó su presupuesto sin llegar a la página que el push había
    // reescrito entera.
    const r = orden([
      'src/pages/Eficiencia.jsx',
      'src/components/eficiencia/FilaServicio.jsx',
      'src/components/eficiencia/libro.css.js',
      'src/index.css',
      'src/i18n.jsx',
    ])
    expect(r.rutas[0]).toBe('/eficiencia')
    expect(r.rutas.length).toBeGreaterThan(20)
  })

  it('INYECCIÓN DE FALLO: sin centralidad, el orden deja de acertar', () => {
    // Una guarda de orden que no se ha visto fallar no sirve. Hace falta un
    // diff donde las DOS señales discrepen, porque en el caso fácil el peso
    // sólo ya acierta y la inyección no probaría nada: se cambia una página
    // ligera —/datos, un módulo, peso 1— y tres hojas de otra —/eficiencia,
    // peso 2—. Por peso gana /eficiencia; lo que el push reescribió es /datos.
    const entradas = [
      'src/pages/Datos.jsx',
      'src/components/eficiencia/SerieServicio.jsx',
      'src/components/eficiencia/FilaServicio.jsx',
      'src/components/eficiencia/TablaPares.jsx',
    ]
    const bien = orden(entradas)
    expect(bien.rutas[0]).toBe('/datos')
    expect(bien.directas).toBe(1)
    // Y que sea de verdad una discrepancia, no una coincidencia de orden.
    const pDatos = bien.detalle.find((d) => d.ruta === '/datos')!.peso
    const pEfi = bien.detalle.find((d) => d.ruta === '/eficiencia')!.peso
    expect(pEfi).toBeGreaterThan(pDatos)

    // Ahora se le quita al grafo el mapa que dice de quién es cada ruta.
    const roto = { ...grafo, paginaPorRuta: new Map<string, string>() }
    const r = ordenarPorCentralidad(entradas, roto as typeof grafo)
    expect(r.directas).toBe(0)
    expect(
      r.rutas[0],
      'con la centralidad rota el orden sigue acertando: entonces no la decide ella',
    ).toBe('/eficiencia')
  })

  it('sin directas, el gancho pasa 0 y la lista entera vuelve a rotarse', () => {
    // La consecuencia aguas abajo, que es donde duele: `--rotate-desde 0` es
    // `--rotate` con otro nombre. Un cambio que no toca ningún módulo de página
    // NO tiene cabeza que proteger, y eso es correcto — pero tiene que verse.
    const r = orden(['src/i18n.jsx'])
    expect(r.directas).toBe(0)
    expect(r.rutas.length).toBeGreaterThan(20)
  })
})
