import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { LECTURAS_VIDEO_REGMEET, parseRegmeetVideo } from '../src/scraper/regmeet-video'

// Fixtures reales:
//   página de sesión del 03-07-2026 (1237hbp), descargada el 2026-10-13 — ver
//     tests/regmeet-documentos.test.ts. Incrusta L6Cy1hTrpIc, que el canal de
//     YouTube ya no lista (salió de la ventana de 60 vídeos).
//   índice de sesiones de 2026 de aytoribarroja, descargado el 2026-05-25: una
//     página de regmeet que NO es de sesión y no lleva reproductor.
const SESION = readFileSync('tests/fixtures/regmeet_sesion_documentos_2026-07-03.html', 'utf8')
const INDICE = readFileSync('tests/fixtures/regmeet_aytoribarroja_2026_2026-05-25.html', 'utf8')

const DIV =
  '<div id="videoId" style="display:none">https://www.youtube.com/watch?v=L6Cy1hTrpIc</div>'

describe('parseRegmeetVideo (página real del 03-07-2026)', () => {
  it('mide algo: la fixture lleva el marcador y el reproductor', () => {
    expect(SESION).toContain(DIV)
    expect(SESION).toContain('id="player"')
  })

  it('saca el id del vídeo incrustado y lo devuelve en la URL canónica', () => {
    expect(parseRegmeetVideo(SESION)).toEqual({
      lectura: 'con-video',
      ytId: 'L6Cy1hTrpIc',
      url: 'https://www.youtube.com/watch?v=L6Cy1hTrpIc',
      crudo: 'https://www.youtube.com/watch?v=L6Cy1hTrpIc',
    })
  })

  it('lee lo que reproduce el navegador: corta en «&» como la expresión de la propia página', () => {
    const conTiempo = SESION.replace(
      DIV,
      '<div id="videoId" style="display:none">https://www.youtube.com/watch?v=L6Cy1hTrpIc&amp;t=90</div>',
    )
    expect(parseRegmeetVideo(conTiempo).ytId).toBe('L6Cy1hTrpIc')
    const corta = SESION.replace(
      DIV,
      '<div id="videoId" style="display:none">https://youtu.be/L6Cy1hTrpIc</div>',
    )
    expect(parseRegmeetVideo(corta).ytId).toBe('L6Cy1hTrpIc')
  })
})

describe('parseRegmeetVideo: lo que no es un vídeo nunca se lee como «sin vídeo»', () => {
  it('sólo el marcador presente y vacío es «sin-video»', () => {
    // Las 33 capturas de Wayback medidas el 27-10-2026 traían todas vídeo: esta
    // forma no se ha visto todavía, y es la única que dice que no lo hay.
    const vacio = SESION.replace(DIV, '<div id="videoId" style="display:none">  </div>')
    expect(parseRegmeetVideo(vacio)).toEqual({
      lectura: 'sin-video',
      ytId: null,
      url: null,
      crudo: '',
    })
  })

  it('una página de regmeet sin marcador (el índice, una página de reto) es «sin-marcador», no «sin-video»', () => {
    expect(INDICE).not.toContain('id="videoId"')
    expect(parseRegmeetVideo(INDICE)).toEqual({
      lectura: 'sin-marcador',
      ytId: null,
      url: null,
      crudo: null,
    })
    expect(parseRegmeetVideo('')).toMatchObject({ lectura: 'sin-marcador', ytId: null })
  })

  it('un marcador cuyo contenido no es un vídeo de YouTube es «ilegible» y guarda el texto', () => {
    const otro = SESION.replace(
      DIV,
      '<div id="videoId" style="display:none">https://vimeo.com/123456</div>',
    )
    expect(parseRegmeetVideo(otro)).toEqual({
      lectura: 'ilegible',
      ytId: null,
      url: null,
      crudo: 'https://vimeo.com/123456',
    })
    const corto = SESION.replace(
      DIV,
      '<div id="videoId" style="display:none">https://www.youtube.com/watch?v=abc</div>',
    )
    expect(parseRegmeetVideo(corto).lectura).toBe('ilegible')
  })

  it('dos marcadores con vídeos distintos son «ilegible»: no se elige uno', () => {
    const dos = SESION.replace(
      DIV,
      DIV + '<div id="videoId">https://www.youtube.com/watch?v=EKoMiCY-HUk</div>',
    )
    expect(parseRegmeetVideo(dos)).toMatchObject({ lectura: 'ilegible', ytId: null })
    // El mismo vídeo dos veces sigue siendo un vídeo.
    expect(parseRegmeetVideo(SESION.replace(DIV, DIV + DIV)).ytId).toBe('L6Cy1hTrpIc')
  })

  it('toda lectura cae en el vocabulario exportado', () => {
    const lecturas = [SESION, INDICE, ''].map((h) => parseRegmeetVideo(h).lectura)
    for (const l of lecturas) expect(LECTURAS_VIDEO_REGMEET).toContain(l)
  })
})
