import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { avisosHitos, HITOS, HITOS_MUDOS, textoDeHito } from '../src/services/avisos-hitos'

/**
 * Los hitos de una queja —diez apoyos, registrada en sede, silencio
 * administrativo, escalada al Síndic— se avisan a quien modera, por mensaje
 * privado. Hasta el 2026-09-29 salían al canal público de Telegram
 * (`CHANNEL_ID`); desde que las quejas llegan por WhatsApp, Telegram es sólo
 * para administrar.
 */
const ID = 'Q-ABCD1234'

describe('lo que dice cada hito', () => {
  it('el id y lo que pasó, con sus datos', () => {
    expect(textoDeHito('apoyada', ID, { apoyos: 10 })).toMatch(/Q-ABCD1234.*10 apoyos/s)
    expect(textoDeHito('registrada', ID, { asiento: 'RE-7', csv: 'CSV-9' })).toMatch(
      /Q-ABCD1234[\s\S]*RE-7[\s\S]*CSV-9/,
    )
    expect(textoDeHito('silencio', ID, { plazoDias: 92 })).toMatch(/Q-ABCD1234[\s\S]*92 días/)
    expect(textoDeHito('escalada', ID)).toMatch(/Q-ABCD1234[\s\S]*escalada/)
  })

  it('la escalada dice lo que hizo el bot, no que la remitió al Síndic', () => {
    expect(textoDeHito('escalada', ID)).not.toMatch(/remitid/i)
  })

  it('cada uno lleva a la tarjeta de la queja', () => {
    for (const h of HITOS) expect(textoDeHito(h, ID), h).toContain(`/revisar ${ID}`)
  })
})

describe('a quién llega', () => {
  function telegram(falla: (chat: number) => boolean = () => false) {
    const enviados: Array<{ chat: number; texto: string }> = []
    return {
      enviados,
      mensaje: async (chat: number, texto: string) => {
        if (falla(chat)) throw new Error('403 bloqueado')
        enviados.push({ chat, texto })
        return { message_id: 1 }
      },
    }
  }

  it('a cada administrador', async () => {
    const tg = telegram()
    const r = await avisosHitos({ admins: () => [9001, 9002], mensaje: tg.mensaje }).avisar(
      'apoyada',
      ID,
      { apoyos: 10 },
    )
    expect(r).toEqual({ entregados: 2, fallidos: 0 })
    expect(tg.enviados.map((e) => e.chat)).toEqual([9001, 9002])
  })

  it('si a uno no le llega, a los demás sí, y se cuenta', async () => {
    const tg = telegram((chat) => chat === 9001)
    const r = await avisosHitos({ admins: () => [9001, 9002], mensaje: tg.mensaje }).avisar(
      'registrada',
      ID,
    )
    expect(r).toEqual({ entregados: 1, fallidos: 1 })
  })

  it('si no le llega a ninguno, falla, para que quien avisa pueda reintentarlo', async () => {
    const tg = telegram(() => true)
    await expect(
      avisosHitos({ admins: () => [9001, 9002], mensaje: tg.mensaje }).avisar('silencio', ID, {
        plazoDias: 92,
      }),
    ).rejects.toThrow(/ningún administrador/)
  })

  it('sin administradores no hay a quién avisar, y lo dice sin fallar', async () => {
    const tg = telegram()
    expect(
      await avisosHitos({ admins: () => [], mensaje: tg.mensaje }).avisar('escalada', ID),
    ).toEqual({ entregados: 0, fallidos: 0 })
    expect(await HITOS_MUDOS.avisar('apoyada', ID)).toEqual({ entregados: 0, fallidos: 0 })
  })
})

describe('el bot ya no publica en un canal', () => {
  const SRC = join(__dirname, '..', 'src')
  const fuentes = (d: string): Array<{ f: string; texto: string }> =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? fuentes(join(d, e.name))
        : e.name.endsWith('.ts')
          ? [{ f: join(d, e.name), texto: readFileSync(join(d, e.name), 'utf8') }]
          : [],
    )

  it('nada en bot/src lee CHANNEL_ID, y channel.ts no existe', () => {
    const todas = fuentes(SRC)
    expect(todas.length).toBeGreaterThan(20) // el control: el barrido mira algo
    // Leerla, no nombrarla: los comentarios cuentan su historia.
    const lee = /\benv\.CHANNEL_ID\b|\benv\[\s*['"]CHANNEL_ID['"]\s*\]/
    expect(todas.filter((x) => lee.test(x.texto)).map((x) => x.f)).toEqual([])
    expect(existsSync(join(SRC, 'services', 'channel.ts'))).toBe(false)
  })
})
