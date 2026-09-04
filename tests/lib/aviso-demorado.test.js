/**
 * El aviso de «cargando» sólo debe hablar si la espera se nota.
 *
 * Medido en la capa de inundación antes de esto: el aviso aparecía a los 90 ms
 * y desaparecía a los 107. Diecisiete milisegundos de parpadeo no son
 * información — y llaman la atención justo sobre lo único que iba rápido.
 *
 * Pero el caso que de verdad importa es el contrario, y en el navegador no se
 * puede provocar: una espera larga de un servicio ajeno. Por eso la lógica del
 * retardo vive aquí fuera, en algo que se puede adelantar el reloj y medir.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { creaAvisoDemorado } from '../../src/lib/aviso-demorado'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('aviso demorado', () => {
  it('una carga rápida no llega a decir nada', () => {
    const visto = []
    const a = creaAvisoDemorado((v) => visto.push(v), 250)
    a.empieza()
    vi.advanceTimersByTime(100)
    a.termina()
    vi.advanceTimersByTime(1000)
    // Ni un solo 'cargando': es el parpadeo que se quiere evitar.
    expect(visto).toEqual([null])
  })

  it('una carga lenta sí lo dice, y luego lo retira', () => {
    const visto = []
    const a = creaAvisoDemorado((v) => visto.push(v), 250)
    a.empieza()
    vi.advanceTimersByTime(300)
    expect(visto).toEqual(['cargando'])
    a.termina()
    expect(visto).toEqual(['cargando', null])
  })

  it('no lo dice ANTES del umbral', () => {
    const visto = []
    const a = creaAvisoDemorado((v) => visto.push(v), 250)
    a.empieza()
    vi.advanceTimersByTime(249)
    expect(visto).toEqual([])
  })

  it('el reloj cuenta desde la PRIMERA tanda, no se reinicia con cada una', () => {
    // Leaflet dispara `loading` por cada tanda de teselas, y al arrastrar el
    // mapa llegan seguidas. Si cada tanda reiniciara la cuenta, quien lleva
    // diez segundos esperando no vería nunca el aviso, que es justo a quien va
    // dirigido. Así que la cuenta arranca con la primera y no se toca.
    const visto = []
    const a = creaAvisoDemorado((v) => visto.push(v), 250)
    a.empieza()
    vi.advanceTimersByTime(200)
    a.empieza() // segunda tanda: no debe reiniciar nada
    vi.advanceTimersByTime(60) // 260 ms desde la primera
    expect(visto).toEqual(['cargando'])
  })

  it('una tanda con una tesela caída acaba en ERROR, no en silencio', () => {
    // La regresión que costó una traza de consola encontrar: Leaflet dispara
    // `load` cuando la tanda acaba AUNQUE sus teselas hayan fallado, en este
    // orden exacto — loading → tileerror → load. Dictaminando en el fallo, el
    // error se ponía y `load` lo borraba un instante después, y la capa se
    // quedaba encendida pintando nada y sin decir nada.
    const visto = []
    const a = creaAvisoDemorado((v) => visto.push(v), 250)
    a.empieza()
    a.falla()
    a.termina()
    expect(visto).toEqual(['error'])
  })

  it('la tanda siguiente no hereda el fallo de la anterior', () => {
    const visto = []
    const a = creaAvisoDemorado((v) => visto.push(v), 250)
    a.empieza()
    a.falla()
    a.termina()
    a.empieza()
    a.termina()
    expect(visto).toEqual(['error', null])
  })

  it('cancelar al desmontar no enciende un aviso huérfano', () => {
    // Si la capa se apaga a media carga, su leyenda ya no existe: encender el
    // aviso después dejaría el estado en `true` para el próximo encendido.
    const visto = []
    const a = creaAvisoDemorado((v) => visto.push(v), 250)
    a.empieza()
    a.cancela()
    vi.advanceTimersByTime(1000)
    expect(visto).toEqual([])
  })
})
