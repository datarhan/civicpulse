import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ¿Despliega ALGUIEN el bot cuando su código cambia?
 *
 * El 2026-09-09 la respuesta era no, y costó lo que tenía que costar. Ese día se
 * añadió al calendario un premio que cerraba en 36 días y se comprobó que el
 * aviso salía bien; la máquina de Fly seguía sirviendo la versión de las
 * 08:16Z, anterior a los cuatro commits del día. El aviso del 15 de septiembre
 * no iba a salir de ninguna manera, y nada lo decía: `bot.yml` corre las
 * pruebas —verde—, `main` tenía el código —verde—, y el bot en producción era
 * de otra hora.
 *
 * Y ya había pasado: el 8-09 el bot se quedó MUDO al rotar el token porque Fly
 * no se actualizó. Dos veces es el patrón, no el accidente.
 *
 * Comitear no es desplegar. Esa distancia la cubría una persona acordándose, y
 * acordarse no es un mecanismo.
 *
 * Esta prueba NO exige que el despliegue funcione —eso depende de un secreto
 * que vive en GitHub— sino que EXISTA y se dispare solo. Es la misma pregunta
 * que `bot-tests-cubiertos.test.js` hace de las pruebas: ¿quién ejecuta esto?
 */
const WF = join(__dirname, '..', '.github', 'workflows')

const workflows = readdirSync(WF)
  .filter((f) => /\.ya?ml$/.test(f))
  .map((f) => ({
    nombre: f,
    // Sin comentarios: dentro de uno hay órdenes falsas y explicaciones que
    // nombran justo lo que se busca.
    texto: readFileSync(join(WF, f), 'utf8')
      .split('\n')
      .filter((l) => !/^\s*#/.test(l))
      .join('\n'),
  }))

/** Desplegar el bot es invocar a flyctl, no mencionarlo. */
const DESPLIEGA = /(?:flyctl|fly)\s+deploy|superfly\/flyctl-actions/

describe('el bot lo despliega alguien', () => {
  it('algún workflow despliega el bot', () => {
    const cubren = workflows.filter((w) => DESPLIEGA.test(w.texto))
    expect(
      cubren.map((w) => w.nombre),
      'ningún workflow despliega el bot: comitear no es desplegar, y la distancia la cubría alguien acordándose',
    ).not.toEqual([])
  })

  // Un despliegue manual no cierra la distancia: es la misma persona
  // acordándose, sólo que con otra interfaz.
  it('ese workflow se dispara con un push, no sólo a mano', () => {
    const cubren = workflows.filter((w) => DESPLIEGA.test(w.texto))
    const automaticos = cubren.filter((w) => /^\s*push:/m.test(w.texto))
    expect(
      automaticos.map((w) => w.nombre),
      'el único que despliega el bot es de disparo manual',
    ).not.toEqual([])
  })

  // Y tiene que mirar `bot/**`: un despliegue que sólo corre cuando cambia otra
  // cosa vuelve a dejar el bot atrás, que es exactamente el defecto.
  it('se dispara cuando cambia el código DEL BOT', () => {
    const cubren = workflows.filter((w) => DESPLIEGA.test(w.texto) && /^\s*push:/m.test(w.texto))
    const porRuta = cubren.filter((w) => /['"]?bot\/\*\*/.test(w.texto))
    expect(
      porRuta.map((w) => w.nombre),
      'el despliegue del bot no se dispara con los cambios de bot/**',
    ).not.toEqual([])
  })

  // Un despliegue que no puede autenticarse tiene que DECIRLO, no pasar en
  // verde sin haber desplegado. Es la regla 2 de DATA_INTEGRITY: una pasada
  // tiene que probar que hizo el trabajo, y «no hice nada» no lo prueba.
  it('si falta el secreto, falla en vez de fingir que desplegó', () => {
    const cubren = workflows.filter((w) => DESPLIEGA.test(w.texto))
    const comprueban = cubren.filter((w) => /FLY_API_TOKEN/.test(w.texto) && /exit 1/.test(w.texto))
    expect(
      comprueban.map((w) => w.nombre),
      'sin comprobar el secreto, un despliegue que no ocurre se ve igual que uno que sí',
    ).not.toEqual([])
  })
})
