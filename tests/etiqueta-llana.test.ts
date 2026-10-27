import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { etiquetaDelPunto } from '../src/scraper/etiqueta-llana'

/**
 * La etiqueta llana de un punto del orden del día: el título oficial sin lo que
 * un vecino no necesita para saber de qué va —el área en mayúsculas, el número
 * de expediente, «Acord relatiu a», «Donar compte de», el código del contrato—.
 * No se reescribe nada: sólo se quita por delante y por detrás, en la lengua en
 * que se convocó el punto. El título literal sigue en la pestaña del orden del
 * día de /plenos/:id.
 *
 * Cada título de aquí está copiado tal cual de public/data/plenos-agendas.json
 * (27-10-2026); el comentario dice de qué sesión y punto.
 */
describe('etiquetaDelPunto — lo que se quita', () => {
  it.each([
    // zrbgic #3: el código del contrato y el punto final
    [
      'Inicio del expediente de contratación para la licitación del suministro de sustitución del pavimento de césped artificial de la instalación del estadio de fútbol Roberto Gil en régimen de arrendamiento, con opción de compra, por procedimiento abierto, varios criterios de adjudicación, con condición de ejecución de carácter social y medioambiental, contribuyendo al cumplimiento del ODS 12 de “Producción y consumo responsables” y ODS 13 “Acción por el clima” de la Agenda 2030, contrato sujeto a regulación armonizada, siendo su tramitación anticipada. (Ctto. 122/2026)',
      'Inicio del expediente de contratación para la licitación del suministro de sustitución del pavimento de césped artificial de la instalación del estadio de fútbol Roberto Gil en régimen de arrendamiento, con opción de compra, por procedimiento abierto, varios criterios de adjudicación, con condición de ejecución de carácter social y medioambiental, contribuyendo al cumplimiento del ODS 12 de “Producción y consumo responsables” y ODS 13 “Acción por el clima” de la Agenda 2030, contrato sujeto a regulación armonizada, siendo su tramitación anticipada',
    ],
    // zrbgic #7: «Dar cuenta de las»
    [
      'Dar cuenta de las Resoluciones de la número 2850/2026 a la 3084//2026',
      'Resoluciones de la número 2850/2026 a la 3084//2026',
    ],
    // k4olcs #5: expediente en valenciano y «Acord relatiu a l'»
    [
      "Expedient: 717/2026/GEN, Acord relatiu a l'Expedient de minimització d'impacte territorial en Polígon 46 Parcel·la 39 amb ref. cat: 46216A046000390000TZ",
      "Expedient de minimització d'impacte territorial en Polígon 46 Parcel·la 39 amb ref. cat: 46216A046000390000TZ",
    ],
    // k4olcs #9: «Dació compte al Ple de la»
    [
      "Expedient: 121/2026/GEN, Dació compte al Ple de la Liquidació de l'exercici 2025",
      "Liquidació de l'exercici 2025",
    ],
    // otxq2c #9: área en mayúsculas, expediente con un espacio antes de la coma
    [
      'SECRETARIA, Expedient: 3567/2025/GEN , Donar compte de la concessió de pròrroga de la Jutgessa de Pau substituta de Riba-roja de Túria',
      'Concessió de pròrroga de la Jutgessa de Pau substituta de Riba-roja de Túria',
    ],
    // 1tgd1h4 #15: área en minúsculas con punto
    [
      "Innovació. Expedient 4799/2023/GEN, Donar compte de la bitàcola de la BOOTCAMP del Hub d'Innovació RIBA_LAB a l'Ajuntament de Riba-roja de Túria per a potenciar les competències en matèria de col·laboració, creativitat i innovació",
      "Bitàcola de la BOOTCAMP del Hub d'Innovació RIBA_LAB a l'Ajuntament de Riba-roja de Túria per a potenciar les competències en matèria de col·laboració, creativitat i innovació",
    ],
    // 15000go #5: área con «, :» y «Donar compte de l'»
    [
      "URBANISME, : Donar compte de l'informe Ambiental i Estratègic de la UE CASC 1",
      'Informe Ambiental i Estratègic de la UE CASC 1',
    ],
    // 67qdq8 #16: «Expte» sin dos puntos, «al Ple de la Corporació de la»
    [
      "CONTRACTACIÓ Expte 5356/2022/GEN Dació compte al Ple de la Corporació de la inclusió de nous contractes no previstos en el Pla de Contractació Anual, a celebrar en l'exercici 2023 dins del cronograma del primer semestre, després d'acords adoptats per la Junta de Govern Local, modificació sisena a novena",
      "Inclusió de nous contractes no previstos en el Pla de Contractació Anual, a celebrar en l'exercici 2023 dins del cronograma del primer semestre, després d'acords adoptats per la Junta de Govern Local, modificació sisena a novena",
    ],
    // jpr4fk #14: «Dació de compte al Ple de la Corporació de l'»
    [
      "Expedient: 3235/2023/GEN: Dació de compte al Ple de la Corporació de l'Execució Trimestral (1T) i la informació a subministrar al Ple municipal",
      'Execució Trimestral (1T) i la informació a subministrar al Ple municipal',
    ],
    // 1sqj7is #5: «Acuerdo relativo al»
    [
      'Acuerdo relativo al sometimiento a información pública de la versión inicial del PRI de la UE Casco 1',
      'Sometimiento a información pública de la versión inicial del PRI de la UE Casco 1',
    ],
    // 1qi8axv #6: expediente con dos puntos detrás del código
    [
      'Expedient 6478/2025/GEN: Aprovació llesta de factures 135 – Reconeixement Extrajudicial núm. 49/2025',
      'Aprovació llesta de factures 135 – Reconeixement Extrajudicial núm. 49/2025',
    ],
    // k4olcs #7: expediente sin dos puntos y código del contrato
    [
      "Expedient 1562/2018/GEN, Acceptació proposada d'adjudicació mesa de contractació relatiu al contracte de concessió del servici públic de proveïment d'aigua potable, servici de gestió de clavegueram, control d'abocaments i depuració del municipi Riba-roja de Túria, per procediment obert, millor relació qualitat preu, diversos criteris d'adjudicació i amb clàusules mediambientals i amb condició especial d'execució de caràcter mediambiental i social. (Ctto. 27/2018)",
      "Acceptació proposada d'adjudicació mesa de contractació relatiu al contracte de concessió del servici públic de proveïment d'aigua potable, servici de gestió de clavegueram, control d'abocaments i depuració del municipi Riba-roja de Túria, per procediment obert, millor relació qualitat preu, diversos criteris d'adjudicació i amb clàusules mediambientals i amb condició especial d'execució de caràcter mediambiental i social",
    ],
  ])('%s', (titulo, llana) => {
    expect(etiquetaDelPunto(titulo)).toEqual({ texto: llana, urgente: false })
  })
})

describe('etiquetaDelPunto — los asuntos de urgencia', () => {
  it.each([
    // zrbgic #6
    [
      'Asuntos de Urgencia. RECURSOS HUMANOS, Acuerdo para la modificación de los criterios de reparto de la asignación a los grupos políticos para la anualidad 2026',
      'Acuerdo para la modificación de los criterios de reparto de la asignación a los grupos políticos para la anualidad 2026',
    ],
    // 1du4rf5 #12: numeración «12.1.» y código suelto
    [
      "Assumpte d'Urgència 12.1. 5559/2025/GEN, Aprovació reconeixement extrajudicial 41/2025 - Aprovació llesta de factures 12025000087, relació d'obligacions 12025000844",
      "Aprovació reconeixement extrajudicial 41/2025 - Aprovació llesta de factures 12025000087, relació d'obligacions 12025000844",
    ],
    // hp3y4s #16: en mayúsculas y con «16.1»
    [
      'ASUNTOS DE URGENCIA. 16.1 Aprobación del expediente de reconocimiento extrajudicial nº 10/2025',
      'Aprobación del expediente de reconocimiento extrajudicial nº 10/2025',
    ],
    // of2npg #6: urgencia, área y expediente, por ese orden
    [
      "Assumptes d'urgència. INTERVENCIÓ, Expedient 295/2025/GEN, Aprovació de l'expedient de reconeixement extrajudicial nº1/2025",
      "Aprovació de l'expedient de reconeixement extrajudicial nº1/2025",
    ],
    // rx4hb4 #11: raya y comillas
    [
      "Assumptes d'Urgència – Expedient 647/2026/GEN, “Aprovació PAI EDIL i sol·licitud de la convocatòria de senda financera”",
      'Aprovació PAI EDIL i sol·licitud de la convocatòria de senda financera',
    ],
  ])('%s', (titulo, llana) => {
    expect(etiquetaDelPunto(titulo)).toEqual({ texto: llana, urgente: true })
  })
})

describe('etiquetaDelPunto — lo que no se toca', () => {
  it.each([
    // 10yl550 #2: no hay nada que quitar
    'Aprobación expediente Reconocimiento Extrajudicial nº 13/2026. Lista de facturas 12026000031, relación de obligaciones 12026000100',
    // Una moción lleva su autor en el título, y se queda
    'Moción conjunta del Grupo Partido Popular Riba-roja de Túria y VOX para la organización de actividades conmemorativas del “9 d’octubre” con motivo de 750 aniversario de la muerte de Jaume I',
    'Precs i preguntes',
    'Ruegos y preguntas',
  ])('%s', (titulo) => {
    expect(etiquetaDelPunto(titulo)).toEqual({ texto: titulo, urgente: false })
  })

  it('si quitarlo todo lo deja vacío, se queda lo último que decía algo', () => {
    // mvb5nl #5 y 1r6yy0 #9: el título entero es la fórmula
    expect(etiquetaDelPunto('Dacio compte')).toEqual({ texto: 'Dacio compte', urgente: false })
    expect(etiquetaDelPunto("Despatx d'urgència. 9.1. Donar Compte")).toEqual({
      texto: 'Donar Compte',
      urgente: true,
    })
  })
})

/**
 * Sobre todos los puntos del snapshot de prueba: ninguna etiqueta sale vacía,
 * ninguna es más larga que su título, y ninguna empieza por lo que se quita.
 */
describe('etiquetaDelPunto — sobre un snapshot entero', () => {
  const plenos: { agenda: { title: string }[] }[] = JSON.parse(
    readFileSync(join(__dirname, 'fixtures', 'plenos-agendas_2026-10-10.json'), 'utf8'),
  ).plenos
  const titulos = plenos.flatMap((p) => p.agenda.map((a) => a.title))

  it('lee puntos de verdad', () => {
    expect(titulos.length).toBeGreaterThan(20)
  })

  it('ninguna etiqueta queda vacía ni crece', () => {
    for (const t of titulos) {
      const { texto } = etiquetaDelPunto(t)
      expect(texto.trim().length, t).toBeGreaterThan(2)
      expect(texto.length, t).toBeLessThanOrEqual(t.length)
    }
  })

  it('ninguna empieza por un expediente, un área seguida de expediente o «Dar cuenta»', () => {
    for (const t of titulos) {
      const { texto } = etiquetaDelPunto(t)
      expect(texto, t).not.toMatch(/^(?:Expedient|Expte|\d+\/\d{4}\/)/i)
      expect(texto, t).not.toMatch(/^[A-ZÀ-Ý ]{4,}[,.]?\s+Exp/)
      expect(texto, t).not.toMatch(/^(?:Dar cuenta|Donar compte|Daci[oó]n? )/i)
    }
  })
})
