#!/usr/bin/env node
// escanear.mjs — señala marcas léxicas y tipográficas de texto generado.
//
//   node "$(git rev-parse --show-toplevel)/.claude/skills/escritura-sin-marcas/scripts/escanear.mjs" \
//        <fichero…> [--lang es|en|va] [--plano] [--campos] [--incluir-citas]
//
// Aconseja; nunca bloquea: sale 0 siempre. No es un detector de autoría ni
// puede serlo. Un recuento bajo NO prueba que un texto lo escribiera una
// persona, y uno alto no prueba que lo escribiera una máquina: las mismas
// marcas salen en prosa humana, y un texto generado y bien editado no tiene
// ninguna. Lo que el escáner no ve (una cita que no dice lo que la frase
// afirma, una cifra cambiada al reescribir) es lo que más daño hace; eso es el
// procedimiento de SKILL.md, no este script.
//
// Sin dependencias. Las reglas salen de references/catalogo.md; cada una lleva
// el id de su entrada para que el informe remita a ella.
//
// Opciones:
//   --lang es|en|va   fuerza el idioma de todas las líneas. Sin ella, se
//                     decide por línea (un fichero bilingüe, como src/i18n.jsx,
//                     lleva castellano, valenciano e inglés).
//   --plano           el destino NO renderiza Markdown (correo, formulario,
//                     PDF, sede electrónica): `**`, `#`, `---` y enlaces
//                     Markdown pasan a ser marcas. Implícito en .txt y .eml.
//   --campos          el fichero es un borrador de formulario: cada título
//                     Markdown (`## Why did you choose…`) es el NOMBRE de un
//                     campo, que no se pega. Los títulos no se escanean y el
//                     informe sale campo a campo, con sus palabras. Escanea
//                     así cualquier borrador de `editorial/` con varios campos.
//   --incluir-citas   escanea también lo que va entre «», “” y "". Por
//                     defecto «» se salta: citar el lenguaje de una fuente es
//                     prueba, no marca (p. ej. «sin precedentes» de un
//                     proveedor citado en un reportaje). Lo que va entre “” o
//                     "" se lee igual, pero sale aparte («dentro de
//                     comillas»): en inglés suele ser el marco del propio
//                     autor, no una cita.
//
// Nunca se escanean:
//   - los lemas canónicos de docs/DESCRIPCION.md §Textos canónicos (se leen
//     de allí, no de una copia; se citan literales a propósito);
//   - lo que va entre <!-- declaracion-ia --> y <!-- /declaracion-ia -->: una
//     declaración de uso de IA no se acorta ni se disimula; el informe dice
//     que la ha saltado.

/* global console, process, URL */
import { readFileSync } from 'node:fs'
import { extname } from 'node:path'

// ---------------------------------------------------------------- argumentos
const USO = 'uso: escanear.mjs <fichero…> [--lang es|en|va] [--plano] [--campos] [--incluir-citas]'
const args = process.argv.slice(2)
const opts = { lang: null, plano: false, citas: false, campos: false }
const files = []
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--lang') opts.lang = (args[++i] || '').toLowerCase()
  else if (a.startsWith('--lang=')) opts.lang = a.slice(7).toLowerCase()
  else if (a === '--plano') opts.plano = true
  else if (a === '--campos' || a === '--sin-titulos') opts.campos = true
  else if (a === '--incluir-citas') opts.citas = true
  else if (a === '-h' || a === '--help') {
    console.log(USO)
    process.exit(0)
  } else files.push(a)
}
if (opts.lang && !['es', 'en', 'va'].includes(opts.lang)) {
  console.log(`--lang ${opts.lang}: idioma no reconocido (es, en, va). Se decide por línea.`)
  opts.lang = null
}
if (files.length === 0) {
  console.log('No se ha escaneado nada: falta el fichero.')
  console.log(USO)
  process.exit(0)
}

// ---------------------------------------------------------------- utilidades
const L = '\\p{L}\\p{N}_'
/** Palabra completa con límites Unicode (\b de JS no ve «ó» ni «ç»). */
const w = (src, flags = 'giu') => new RegExp(`(?<![${L}])(?:${src})(?![${L}])`, flags)
const blank = (s) => s.replace(/[^\n]/g, ' ')
/** Tapa una cita con U+2007, no con espacios: tapar con espacios fabricaba
 *  rayas espaciadas («objetivos —«la ocupación…»—.» pasaba a « — ») y F5
 *  señalaba un inciso castellano correcto. U+2007 sigue siendo \s para el
 *  recuento de palabras, pero no es el espacio que buscan las reglas. */
const tapa = (s) => s.replace(/[^\n]/g, ' ')
const MESES_ES =
  'Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Setiembre|Octubre|Noviembre|Diciembre'
const DIAS_ES = 'Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo'
const MESES_VA = 'Gener|Febrer|Març|Abril|Maig|Juny|Juliol|Agost|Setembre|Octubre|Novembre|Desembre'

// ---------------------------------------------------------------- reglas
// fiab: 'fuerte'  casi nunca aparece en prosa humana del registro. Sólo T1,
//                 E4 y F7: frases de chat, el texto que se describe a sí
//                 mismo y artefactos pegados;
//       'débil'   sólo cuenta en racimo (≥3 en un párrafo). Aquí van también
//                 el metadiscurso, las aperturas de escena y la cortesía de
//                 plantilla: eran corrientes en la prosa administrativa y
//                 periodística humana en castellano antes de 2022, y en
//                 inglés las enseñan los cursos de inglés formal;
//       'norma'   error contra la norma o contra el destino (mes con
//                 mayúscula, saludo con coma, comillas inglesas, Markdown en
//                 un campo plano). Se corrige siempre y NO dice nada de
//                 autoría: no entra en la densidad ni en los racimos;
//       'estilo'  preferencia de estilo de la casa sobre una forma que la
//                 RAE admite; ni marca ni error, no cuenta;
//       'verdad'  no es una marca de estilo: es una afirmación que hay que
//                 comprobar (absolutos); se cuenta aparte;
//       'pendiente' hueco sin rellenar; se cuenta aparte.
// Una marca que no daña al lector se señala y no se reescribe (aviso 4 del
// catálogo): este informe no sirve para ajustar el texto a un detector.
// fase: 'crudo'  sobre el texto sin limpiar (artefactos en URL, Markdown);
//       'tipo'   sobre la prosa con las citas «» tapadas (comillas inglesas);
//       (omitida) sobre la prosa con todas las citas tapadas.
const R = []
const rule = (id, langs, fiab, re, consejo, fase) =>
  R.push({ id, langs: langs.split(','), fiab, re, consejo, fase })

// --- Artefactos de chat (cualquier idioma) --------------------------------
rule(
  'F7',
  '*',
  'fuerte',
  /utm_source=(?:chatgpt\.com|openai|copilot\.com)|referrer=grok\.com|oaicite|contentReference\[|【\d+†|turn\d+(?:search|view)\d+|<mark>/giu,
  'artefacto de un chat pegado: quítalo y abre la fuente a mano',
  'crudo',
)
rule('F7', '*', 'fuerte', /↩/gu, 'carácter de nota de un chat: quítalo', 'crudo')

// --- Huecos por rellenar ----------------------------------------------------
rule(
  'C7',
  '*',
  'pendiente',
  /⟦[^⟧\n]{0,200}⟧/gu,
  'hueco que sólo puede rellenar el operador: no se envía con él',
  'crudo',
)
rule(
  'C7',
  '*',
  'pendiente',
  /\[(?:Nombre|Name|Insert|Insertar|Describ|Fecha|Date|Your |Tu |Su |Artist|Organi[sz]ation|Organización|Cargo|Título|Title)[^\]\n]{0,100}\]|\b\d{4}-XX-XX\b|\bXX[/-]XX\b|INSERT_[A-Z_]+|\bexample\.com\b/gu,
  'plantilla sin rellenar',
  'crudo',
)

// --- Residuo de conversación ------------------------------------------------
rule(
  'T1',
  'es,va',
  'fuerte',
  w(
    '¡?claro!|por supuesto, aquí|aquí tienes (?:un|una|el|la) (?:borrador|versión|propuesta)|espero que (?:esto|esta información) (?:te|le|os) (?:ayude|sirva)|si (?:necesitas|tienes|quieres) (?:algo más|más preguntas|que lo)|¿quieres que (?:lo|la|te)|como modelo de lenguaje|según mi (?:última actualización|conocimiento)|a fecha de mi (?:último|conocimiento)',
  ),
  'frase dirigida al usuario del chat: fuera',
)
rule(
  'T1',
  'va',
  'fuerte',
  w(
    "clar!|per descomptat, ací|ací tens (?:un|una|el|la) (?:esborrany|versió|proposta)|espere que (?:això|açò|aquesta informació|esta informació) (?:t'|et |vos |us )?(?:ajude|servisca|serveixi)|vols que (?:ho|la|el|et)(?= )",
  ),
  'frase dirigida a l’usuari del xat: fora',
)
rule(
  'T1',
  'en',
  'fuerte',
  w(
    "certainly!|of course!|great question|i hope this helps|let me know if|would you like me to|feel free to (?:reach|contact|ask)|as an ai(?: language model)?|as of my (?:last )?(?:knowledge|training)(?: update| cutoff)?|here(?:'s| is) (?:a|the) (?:draft|revised|polished)",
  ),
  'phrase addressed to the chat user: delete',
)
// T2 es débil: «Quedo a la espera», «Gracias de antemano» o «I am writing to
// request» son de plantilla, pero las personas las escriben desde siempre.
// Sólo «espero que este mensaje le encuentre bien» no tiene uso nativo.
rule(
  'T2',
  'es',
  'débil',
  w(
    'espero que (?:este mensaje|esta carta|este correo) (?:le|te|les) encuentre|no dude(?:n)? en (?:contactar|ponerse|escribir)|gracias de antemano|quedo a la espera de su pronta|me pongo en contacto con (?:usted|ustedes|vosotros) para|querid[oa]s? (?:señor|señora|sr\\.|sra\\.)',
  ),
  'cortesía de plantilla (también humana): ve al hecho; termina cuando termina la petición',
)
rule(
  'T2',
  'va',
  'débil',
  w(
    "espere que (?:este|aquest|eixe) (?:missatge|correu|escrit) (?:el|la|vos|us|et) trobe|no dubte(?:u)? (?:a|en) (?:contactar|posar-se|escriure)|gràcies per endavant|quede a l'espera de la seua (?:prompta|ràpida)",
  ),
  'cortesia de plantilla: al fet; acaba quan acaba la petició',
)
rule(
  'T2',
  'en',
  'débil',
  w(
    "i hope this (?:message|email|letter) finds you well|don'?t hesitate to|thank you in advance for your (?:time|consideration)|i am writing to (?:request|inquire|express)",
  ),
  'template courtesy (humans write it too): open with the request, close when it ends',
)
rule(
  'T3',
  'es,va',
  'débil',
  w(
    'por medio del presente escrito|es por lo que|sin otro particular|aprovecho la ocasión para saludarle|que por medio de la presente',
  ),
  'fórmula arcaica de oficio (la Guía de lenguaje claro GVA pide quitarla)',
)

// --- Metadiscurso y marcos ----------------------------------------------------
// E1 y E2 son débiles: en castellano no hay estudio que las valide (sólo
// listas de prensa sin método) y eran corrientes en prosa humana antes de 2022.
rule(
  'E1',
  'es',
  'débil',
  w(
    'cabe (?:destacar|resaltar|señalar|mencionar|subrayar)|es (?:importante|fundamental|crucial|relevante|esencial|necesario) (?:señalar|destacar|mencionar|tener en cuenta|recordar|subrayar|entender|resaltar)|vale la pena (?:mencionar|destacar|señalar)|conviene (?:destacar|resaltar)',
  ),
  'anuncia la importancia en vez de mostrarla: borra el marco y di el hecho',
)
rule(
  'E1',
  'va',
  'débil',
  w(
    'cal (?:destacar|remarcar|subratllar|assenyalar|esmentar)|és (?:important|fonamental|crucial|rellevant|essencial|necessari) (?:assenyalar|destacar|remarcar|esmentar|tindre en compte|tenir en compte|recordar|subratllar)|val la pena (?:esmentar|destacar|assenyalar|remarcar)|convé (?:destacar|remarcar)',
  ),
  'anuncia la importància en lloc de mostrar-la: esborra el marc i digues el fet',
)
rule(
  'E1',
  'en',
  'débil',
  w(
    "it(?: is|'s) (?:important|worth|crucial|essential|critical) (?:to note|noting|to mention|mentioning|to remember|to highlight|to emphasi[sz]e)|it should be noted|notably,|importantly,",
  ),
  'announces importance instead of showing it: cut the frame, state the fact',
)
rule(
  'E2',
  'es',
  'débil',
  w(
    'en el panorama actual|en la era (?:digital|actual)|en un mundo cada vez más|hoy en día,? más que nunca|en el contexto actual|en los tiempos que corren',
  ),
  'apertura de escena: empieza por el hecho, la fecha o el documento',
)
rule(
  'E2',
  'va',
  'débil',
  w(
    "en el panorama actual|en el context actual|en l'era (?:digital|actual)|en un món cada (?:vegada|volta) més|hui en dia,? més que mai|en els temps que corren",
  ),
  "obertura d'escena: comença pel fet, la data o el document",
)
rule(
  'E2',
  'en',
  'débil',
  w(
    "in today'?s (?:rapidly )?(?:evolving|changing|fast-paced|digital|interconnected)|in an (?:increasingly|ever-(?:changing|evolving))|in the (?:ever-evolving|rapidly evolving|current) landscape",
  ),
  'scene-setting opener: start with the fact, date or document',
)
rule(
  'E3',
  'es,va',
  'débil',
  w(
    'en resumen|en conclusión|en definitiva|en última instancia|al final del día|para concluir|en suma|a modo de conclusión|en conjunt|en resum',
  ),
  'cierre que resume: termina en el último hecho nuevo o en lo que el lector puede hacer',
)
rule(
  'E3',
  'en',
  'débil',
  w('in conclusion|in summary|to sum up|overall,|ultimately,|at the end of the day|all in all'),
  'summary closer: end on the last new fact or on what the reader can do',
)
rule(
  'E4',
  'es,va',
  'fuerte',
  w(
    'en este (?:artículo|documento|texto|informe|post) (?:exploraremos|veremos|analizaremos|abordaremos|repasaremos)|a continuación(?:,)? (?:exploraremos|veremos|analizaremos)',
  ),
  'el texto se describe a sí mismo: quítalo',
)
rule(
  'E4',
  'en',
  'fuerte',
  w(
    "in this (?:article|report|document|essay|post),? (?:we|i)(?: will|'ll)? (?:explore|examine|delve|discuss|look at)|let'?s (?:dive|delve) in",
  ),
  'the text describes itself: delete',
)
rule(
  'E5',
  'es,va',
  'débil',
  /^[ \t]*(?:[-*•][ \t]+)?(?:Asimismo|Además|Por otro lado|No obstante|En este sentido|Por ende|Por lo tanto|De igual (?:modo|manera)|Igualmente|A(?:ixí|ixi) mateix|D'altra banda|A més|No obstant això|En (?:este|aquest) sentit|Per tant)(?![\p{L}])/gmu,
  'conector de arranque: quítalo salvo que la relación lógica no se entienda sin él',
)
rule(
  'E5',
  'en',
  'débil',
  /^[ \t]*(?:[-*•][ \t]+)?(?:Additionally|Moreover|Furthermore|Notably|Importantly|Overall|Ultimately|Crucially)\b/gmu,
  'paragraph-opening connector: drop it unless the logic needs it',
)

// --- Vocabulario ----------------------------------------------------------------
rule(
  'V1',
  'es,va',
  'débil',
  w(
    '(?:juega|jugó|desempeña|desempeñó|juegan|desempeñan) un papel (?:crucial|fundamental|clave|esencial|importante|vital|decisivo)|(?:es|constituye|supone) un testimonio de|deja(?:ndo)? (?:una huella|un legado|una marca) (?:imborrable|indeleble|duradera)|marca(?:ndo)? un (?:hito|antes y un después)|un antes y un después|punto de inflexión|subraya(?:ndo)? la importancia|resalta(?:ndo)? la importancia|reafirma(?:ndo)? su compromiso|pone(?:ndo)? de (?:manifiesto|relieve) (?:la importancia|el compromiso|su compromiso)',
  ),
  'importancia inflada: di qué hace la cosa, con el dato',
)
rule(
  'V1',
  'va',
  'débil',
  w(
    "(?:juga|jugà|jugava|fa|feu|exerceix|exercix|exercí|té) un paper (?:fonamental|clau|crucial|essencial|important|vital|decisiu)|un paper (?:fonamental|clau|crucial|essencial|decisiu)|(?:és|constituïx|constitueix|suposa) un testimoni de|(?:deixa|deixant) (?:una empremta|un llegat) (?:indeleble|imborrable|duradora?)|marca(?:nt)? (?:una fita|un abans i un després)|un abans i un després|punt d'inflexió|(?:subratlla|subratllant|remarca|remarcant) la importància|reafirma(?:nt)? el seu compromís",
  ),
  'importància inflada: digues què fa la cosa, amb la dada',
)
rule(
  'V1',
  'en',
  'débil',
  w(
    '(?:is|stands as|serves as) a testament to|plays? an? (?:pivotal|crucial|vital|key|significant|central) role|underscor(?:es|ing) (?:the|its|their) (?:importance|significance|commitment)|sets the stage for|(?:leaves|left) an? (?:indelible|lasting) mark|enduring legacy|marks? an? (?:pivotal|significant|key) (?:moment|shift|milestone)|a pivotal moment',
  ),
  'inflated significance: say what the thing does, with the figure',
)
rule(
  'V2',
  'es,va',
  'débil',
  w(
    'sumergirnos|sumergirse en|adentrarnos en|adentrarse en|desentrañar|navegar (?:por )?(?:las|la) complejidad(?:es)?|empoderar|empoderamiento|poner en valor|sinergias?|holístic[oa]s?|tapiz de|piedra angular|pilar fundamental|ecosistema de|entramado de|faro de|crisol de|sin precedentes|en el (?:corazón|epicentro) de',
  ),
  'vocabulario hinchado o calcado: usa la palabra llana o el dato',
)
rule(
  'V2',
  'va',
  'débil',
  w(
    'submergir-(?:nos|se) en|endinsar-(?:nos|se) en|desentranyar|apoderar|apoderament|posar en valor|sinergies?|holístic(?:a|s|ues)?|tapís de|pedra angular|pilar fonamental|ecosistema de|far de|gresol de|sense precedents|en el cor de',
  ),
  'vocabulari inflat o calcat: la paraula planera o la dada',
)
// «state-of-the-art» no está: Horizon Europe pide una sección «beyond the
// state of the art», y señalar el vocabulario que la convocatoria exige es un
// falso positivo (V2 · Casa en el catálogo).
rule(
  'V2',
  'en',
  'débil',
  w(
    'delv(?:e|es|ing)|tapestry|intricac(?:y|ies)|meticulous(?:ly)?|commendable|showcas(?:e|es|ing)|pivotal|multifaceted|seamless(?:ly)?|leverag(?:e|es|ing)|harness(?:es|ing)?|synerg(?:y|ies)|holistic|paradigm|realm|navigate the complexities|game[- ]chang(?:er|ing)|unlock(?:s|ing)? the (?:potential|power)|load-bearing|transformative|groundbreaking|cutting-edge|world-class|best-in-class|north star|pressure-test|key takeaways|deep dive',
  ),
  "flagged vocabulary: use the plain word or the figure (the call's own criteria or section names are not a mark)",
)
rule(
  'V3',
  'es,va',
  'débil',
  w(
    'vibrante|enclavad[oa]|rico patrimonio|impresionante belleza|de renombre|de primer nivel|de vanguardia|innovador(?:a|es|as)?|revolucionari[oa]',
  ),
  'tono promocional: cámbialo por el hecho que lo justificaría, o quítalo',
)
rule(
  'V3',
  'va',
  'débil',
  w(
    "vibrant|enclavat|ric patrimoni|de primer nivell|d'avantguarda|innovador(?:a|s|es)?|revolucionàri(?:a|es)?",
  ),
  'to promocional: el fet que el justificaria, o fora',
)
rule(
  'V3',
  'en',
  'débil',
  w(
    'vibrant|nestled|rich (?:cultural )?heritage|breathtaking|renowned|innovative|revolutioni[sz]e[sd]?|robust|empower(?:s|ing|ment)?',
  ),
  "promotional tone: replace with the fact that would justify it, or cut (the call's own criteria, e.g. «innovation», are not a mark)",
)
rule(
  'V4',
  'es,va',
  'débil',
  w(
    '(?:sirve|sirven|sirvió) como|se (?:erige|erigen|alza|alzan|posiciona|posicionan) como|(?:constituye|constituyen) (?:un|una) (?:reflejo|ejemplo|muestra)',
  ),
  'rodeo de «es»: escribe «es» o «tiene»',
)
rule(
  'V4',
  'va',
  'débil',
  w(
    "(?:servix|serveix|servixen|serveixen|servia|va servir) com a|s'(?:erigix|erigeix|erigixen|erigeixen|alça|posiciona|posicionen) com(?: a)?|(?:constituïx|constitueix) (?:un|una) (?:reflex|exemple|mostra)",
  ),
  'rodeig de «és»: escriu «és» o «té»',
)
rule(
  'V4',
  'en',
  'débil',
  w('serves as|stands as|acts as a|boasts|functions as'),
  'copula avoidance: write "is" or "has"',
)
// V5 sólo lleva calcos y falsos amigos que la norma desaconseja. «De cara a»,
// «enfatizar», «remarcable» y «a nivel municipal» (con niveles reales) los
// admiten el DPD o el DLE: van aparte como preferencia de estilo, que no
// cuenta. Comprobado de memoria contra el DPD (2005) y el DLE el 09-11-2026;
// confírmalo en la fuente antes de mover una forma de grupo.
rule(
  'V5',
  'es',
  'débil',
  w(
    'aplicar a (?:una|la|esta) (?:beca|convocatoria|ayuda|subvención|plaza)|aplic(?:o|amos|ó) a (?:una|la|esta) (?:beca|convocatoria|ayuda|subvención)|impact(?:a|ó|ar|an|aron) (?:en|a|sobre)|eventualmente|asum(?:o|imos|ir) que|en base a|a nivel de',
  ),
  'calco o falso amigo: «solicitar», «afectar», «finalmente» (si es finally), «supongo», «según»; «a nivel de» sólo si hay niveles',
)
rule(
  'V5',
  'es',
  'estilo',
  w('remarcable|enfatiz(?:a|ar|ó|ando)|de cara a'),
  'preferencia de estilo (la RAE lo admite): «notable», «subrayar», «para», sólo si queda más llano',
)
rule(
  'V5',
  'va',
  'débil',
  w(
    'en base a|degut a|donat que|tindre que|tenir que|a nivell de|jugar un paper|juga un paper|lo (?:important|millor|pitjor|bo|interessant|normal|curiós)',
  ),
  'castellanisme: «a partir de», «a causa de», «atés que», «haver de», «el que és important», «fer un paper»',
)
rule(
  'V6',
  'en',
  'débil',
  w(
    'quietly|genuinely|plainly|honestly,|the honest (?:version|answer)|the (?:real|useful|right|interesting|better) question',
  ),
  'Claude-style filler: cut it or name the concrete contrast it implies',
)
rule(
  'V6',
  'es,va',
  'débil',
  w(
    'silenciosamente|honestamente|la pregunta de verdad|la verdadera pregunta|la pregunta (?:útil|correcta|interesante)|la pregunta (?:útil|correcta) no es',
  ),
  'relleno de tono: quítalo o di el contraste concreto',
)

// --- Construcciones -------------------------------------------------------------
rule(
  'K1',
  'es,va',
  'débil',
  w(
    'no (?:se trata|es) (?:solo|sólo|solamente|únicamente|simplemente) (?:de )?[^.;:\\n]{1,60}?,? sino|no solo [^.;:\\n]{1,60}? sino también|no (?:és|es tracta) (?:només|sols|solament) [^.;:\\n]{1,60}? sinó|no sols [^.;:\\n]{1,60}? sinó|no (?:es|son|era|és) [^.;:,\\n]{1,40}[,:;] (?:es|son|era|és)(?= )',
  ),
  'paralelismo negativo: vale si corrige una mala lectura concreta; si sólo da ritmo, di la afirmación positiva',
)
// Las variantes de 2025–26: «the useful question is not "X" but "Y"», la
// aposición «X, not Y» y «by measuring, never by assertion». Las comillas se
// tapan con U+2007, así que «is not … but» las atraviesa.
rule(
  'K1',
  'en',
  'débil',
  w(
    "not (?:just|only|merely|simply) [^.;:\\n]{1,60}?,? but(?: also)?|it'?s not [^.;:,\\n]{1,40}[,;:—] it'?s|isn'?t [^.;:,\\n]{1,40}[,;:—] it'?s|(?:is|are|was|were) not [^.;:\\n]{1,80}? but(?= )",
  ),
  'negative parallelism / contrast: keep it if it corrects a specific misreading; if it only gives rhythm, state the positive claim',
)
rule(
  'K1',
  'en',
  'débil',
  /, not (?:a |an |the )?[\p{L}-]+(?=[.,;])|, never by(?![\p{L}])/gu,
  'appositive contrast («X, not Y»): keep it if it corrects a specific misreading (corrective uses do not count towards the one-per-text cap)',
)
rule(
  'K2',
  'en',
  'débil',
  w('rather than'),
  'fresh 2026 tell when used as a reflex: is the contrast needed?',
)
rule(
  'K3',
  'es,va',
  'débil',
  /, (?:subrayando|destacando|reflejando|evidenciando|consolidando|contribuyendo|fomentando|garantizando|promoviendo|impulsando|reforzando|demostrando|poniendo de (?:manifiesto|relieve)|marcando|sentando las bases|posicionando(?:se)?|asegurando|favoreciendo)(?![\p{L}])/giu,
  'gerundio de cola que interpreta (a menudo de posterioridad no inmediata): parte la frase o di quién lo afirma',
)
rule(
  'K3',
  'va',
  'débil',
  /, (?:subratllant|destacant|reflectint|reflectant|evidenciant|consolidant|contribuint|fomentant|garantint|promovent|impulsant|reforçant|demostrant|posant de (?:manifest|relleu)|marcant|assentant les bases|posicionant(?:-se)?|assegurant|afavorint)(?![\p{L}])/giu,
  'gerundi de cua que interpreta: parteix la frase o digues qui ho afirma',
)
rule(
  'K3',
  'es',
  'débil',
  w(
    '(?:el|este|ese|dicho) (?:dato|documento|informe|hecho|acuerdo|resultado) (?:subraya|refleja|evidencia|pone de (?:manifiesto|relieve)|demuestra|confirma la importancia)|(?:la|esta|esa) cifra (?:subraya|refleja|evidencia|demuestra)',
  ),
  'un hecho o un documento que «subraya»: ¿lo dice la fuente o es la interpretación de quien escribe?',
)
rule(
  'K3',
  'en',
  'débil',
  /, (?:highlighting|underscoring|emphasi[sz]ing|reflecting|showcasing|ensuring|fostering|enhancing|contributing to|demonstrating|solidifying|cementing|reinforcing|paving the way|setting the stage|signaling|signalling|marking|aligning with)(?![\p{L}])/giu,
  'trailing -ing analysis: split the sentence or name who makes the claim',
)
rule(
  'K4',
  'es,va',
  'débil',
  w(
    'según (?:los )?expertos|los expertos (?:señalan|afirman|coinciden|apuntan)|(?:diversos|numerosos|varios) (?:estudios|expertos|informes) (?:señalan|indican|muestran|apuntan)|algunos (?:críticos|analistas|observadores)|(?:es|ha sido) (?:ampliamente )?(?:considerad[oa]|reconocid[oa]) como|se ha descrito como',
  ),
  'atribución vaga: nombra la fuente y el documento, o quita la afirmación',
)
rule(
  'K4',
  'va',
  'débil',
  w(
    'segons (?:els )?experts|els experts (?:assenyalen|afirmen|coincideixen|coincidixen|apunten)|(?:diversos|nombrosos|alguns) (?:estudis|experts|informes) (?:assenyalen|indiquen|mostren|apunten)|alguns (?:crítics|analistes|observadors)|(?:és|ha sigut) (?:àmpliament )?(?:considerat|considerada|reconegut|reconeguda) com',
  ),
  "atribució vaga: anomena la font i el document, o lleva l'afirmació",
)
rule(
  'K4',
  'en',
  'débil',
  w(
    'experts (?:say|argue|agree|note|believe)|observers (?:have )?(?:cited|noted)|industry reports|(?:several|many|numerous) (?:studies|experts|reports) (?:show|suggest|indicate)|some critics|(?:is|are|has been) widely (?:regarded|considered|recognized|recognised)|has been described as',
  ),
  'vague attribution: name the source and the document, or drop the claim',
)
rule(
  'K5',
  'en',
  'débil',
  w(
    'independent coverage|featured in|media outlets|active social media presence|is listed in|trade publications',
  ),
  'notability talk: say what the source reported, not that it exists',
)
rule(
  'K6',
  'es,va',
  'débil',
  w(
    'con la información disponible|según la información disponible|no está ampliamente documentad[oa]|la información (?:es )?escasa|en las fuentes proporcionadas|mantiene un perfil bajo',
  ),
  'cautela de chat sobre las fuentes: di qué fuente falta y dónde se buscó (un límite concreto y con causa se queda)',
)
rule(
  'K6',
  'va',
  'débil',
  w(
    'amb la informació disponible|segons la informació disponible|no està àmpliament documentad[ae]|la informació (?:és )?escassa|en les fonts proporcionades',
  ),
  'cautela de xat: digues quina font falta i on s’ha buscat',
)
// Sin «does not by itself establish»: acotar lo que prueba un documento
// concreto es una salvedad exacta, no una cautela de chat (K6 · Casa).
rule(
  'K6',
  'en',
  'débil',
  w(
    'based on (?:the )?available information|not widely documented|(?:limited|scarce) information|in the provided (?:sources|search results)|maintains a low profile',
  ),
  'chat-style source hedge: say which source is missing and where you looked (a specific, caused limit stays)',
)
rule(
  'K7',
  'es,va',
  'débil',
  w(
    'a pesar de (?:sus|los|estos|estas) [^.,\\n]{0,40}(?:retos|desafíos)|se enfrenta a (?:varios|diversos|numerosos|una serie de) (?:retos|desafíos)|perspectivas de futuro|mirando (?:hacia|al) futuro',
  ),
  'fórmula «retos y futuro»: si hay un problema, nómbralo con su dato',
)
rule(
  'K7',
  'va',
  'débil',
  w(
    "malgrat (?:els seus|els|estos|aquests) [^.,\\n]{0,40}reptes|s'enfronta a (?:diversos|nombrosos|una sèrie de) reptes|perspectives de futur|mirant (?:cap a|al) futur",
  ),
  'fórmula «reptes i futur»: si hi ha un problema, anomena’l amb la seua dada',
)
rule(
  'K7',
  'en',
  'débil',
  w(
    'faces (?:several|numerous|a number of|significant) challenges|despite these challenges|future (?:outlook|prospects)|looking ahead',
  ),
  'challenges-and-outlook formula: name the problem with its figure',
)
rule(
  'K8',
  'es,va',
  'débil',
  /desde [^,.;\n]{1,40} hasta [^,.;\n]{1,40}, (?:y )?desde /giu,
  'rangos encadenados decorativos: enumera',
)
rule(
  'K8',
  'en',
  'débil',
  /from [^,.;\n]{1,40} to [^,.;\n]{1,40}, (?:and )?from /giu,
  'chained decorative ranges: just list the items',
)

// K9 · Conexión vaga. WP:AISIGNS la cuenta entre las marcas más comunes de
// 2026; en un monitor cívico es además el modo de emborronar una relación
// («contratos vinculados a un concejal»). Débil como marca, fuerte como
// defecto: di la relación que documenta la fuente.
rule(
  'K9',
  'es',
  'débil',
  w(
    'vinculad[oa]s? (?:a|al|con)|asociad[oa]s? (?:a|al|con)|relacionad[oa]s? con|ligad[oa]s? a|en relación con',
  ),
  'conexión vaga: di la relación que documenta la fuente (adjudicó, firmó, votó, cobró) o quítala',
)
rule(
  'K9',
  'va',
  'débil',
  w(
    'vinculat?s? (?:a|al|amb)|vinculades? (?:a|al|amb)|associat?s? (?:a|al|amb)|associades? (?:a|al|amb)|relacionat?s? amb|relacionades? amb|en relació (?:amb|a)',
  ),
  'connexió vaga: digues la relació que documenta la font (adjudicà, signà, votà) o lleva-la',
)
rule(
  'K9',
  'en',
  'débil',
  w('in connection with|associated with|linked (?:to|with)|connected (?:to|with)|tied to'),
  'vague connection: state the relation the source documents (awarded, signed, voted, paid) or drop it',
)

// --- Afirmaciones a comprobar (no son marcas de estilo) -------------------------
// C2 lista los universales, también los que no parecen absolutos («nada»,
// «ninguna», «todas las», «cada»; «nothing», «none», «every»): la frase más
// cara de una solicitud fue «Nothing that names a person … publishes without
// a human signature», y la lista vieja no la veía. No es una marca: es una
// afirmación por comprobar. Los lemas canónicos («con una fuente para cada
// cifra») y la fórmula del registro de correcciones («Ninguna cifra cambia»)
// no se listan; véase CANONICOS y NO_C2 más abajo.
const C2_ABS = 'absoluto: comprueba que es cierto hoy; si no lo es, acótalo'
const C2_UNI =
  'universal: casi siempre cierto; mira sobre todo los que dicen qué hace o no hace la máquina'
rule(
  'C2',
  'es',
  'verdad',
  w(
    'nunca|jamás|nadie|nada|ningun[oa]s?|ningún|siempre|el único|la única|los únicos|las únicas|en ningún caso|sin excepción',
  ),
  C2_ABS,
)
rule('C2', 'es', 'verdad', w('tod[oa]s (?:l[oa]s|sus|est[oa]s)|cada'), C2_UNI)
rule(
  'C2',
  'va',
  'verdad',
  w(
    "mai|ningú|ningun[ae]?s?|res|cap(?= (?!a(?![\\p{L}]))\\p{L})|sempre|l'únic|l'única|els únics|les úniques|en cap cas|sense excepció",
  ),
  C2_ABS,
)
rule('C2', 'va', 'verdad', w('tots (?:els|els seus)|totes (?:les|les seues)|cada'), C2_UNI)
rule(
  'C2',
  'en',
  'verdad',
  w(
    'never|always|nobody|no one|nothing|none|no (?:human|person|machine|model|other)|the only|first-ever|without exception|in no case|unprecedented|unique(?:ly)?',
  ),
  'absolute: check it is true today; if not, qualify it',
)
rule(
  'C2',
  'en',
  'verdad',
  w('every|all (?:the|of|our|its)'),
  'universal: usually true; check above all the ones about what the machine does or does not do',
)

// --- Tipografía ----------------------------------------------------------------
rule(
  'F2',
  'es,va',
  'norma',
  /[“”]/gu,
  'comillas inglesas en primer nivel: «» primero, “” dentro',
  'tipo',
)
rule(
  'F3',
  'es',
  'norma',
  new RegExp(`(?<![${L}])(?:de|del) (?:${MESES_ES})(?![${L}])`, 'gu'),
  'mes con mayúscula: en castellano va en minúscula',
)
rule(
  'F3',
  'va',
  'norma',
  new RegExp(`(?<![${L}])(?:de|d') ?(?:${MESES_VA})(?![${L}])`, 'gu'),
  'mes amb majúscula: en valencià va en minúscula',
)
rule(
  'F3',
  'es',
  'norma',
  new RegExp(`(?<=[\\p{Ll},] )(?:${DIAS_ES})(?![${L}])`, 'gu'),
  'día de la semana con mayúscula a media frase',
)
// Sólo castellano: en valenciano la coma tras el saludo es de uso normal.
rule(
  'F4',
  'es',
  'norma',
  /^[ \t]*(?:Estimad[oa]s?|Querid[oa]s?|Distinguid[oa]s?|Muy señor)\b[^:\n]{0,60},[ \t]*$/gmu,
  'saludo con coma (inglés): en castellano, dos puntos',
)
rule(
  'F5',
  'es,va',
  'débil',
  /(?<=[\p{L}\p{N}]) — (?=[\p{L}\p{N}])/gu,
  'raya espaciada como coda (uso inglés) en texto nuevo: en castellano la raya abre y cierra el inciso pegada a él. Los lemas canónicos la llevan y no se tocan; la copia publicada sólo se señala',
)
rule(
  'F5',
  'en',
  'débil',
  /—| -- /gu,
  'em dash: keep it where you chose it; change it only if a comma, colon or parentheses reads clearer for this reader (not to look less machine-made)',
)
rule(
  'F6',
  'es,va',
  'norma',
  /\b\d{1,3}(?:,\d{3})+\.\d+\b/gu,
  'separadores ingleses: coma decimal y punto de millar',
)

// ---------------------------------------------------------------- limpieza
function stripMarkdown(text) {
  let t = text
  t = t.replace(/^---\n[\s\S]*?\n---\n/, blank) // frontmatter
  t = t.replace(/^(```|~~~)[^\n]*\n[\s\S]*?\n\1[^\n]*$/gm, blank) // bloques de código
  t = t.replace(/<!--[\s\S]*?-->/g, blank)
  t = t.replace(/`[^`\n]+`/g, blank)
  t = t.replace(/\]\([^)\n]*\)/g, (m) => ']' + blank(m.slice(1)))
  t = t.replace(/<\/?[A-Za-z][^>\n]*>/g, blank)
  t = t.replace(/https?:\/\/\S+/g, blank)
  t = t.replace(/^[ \t]*\|?[ \t:|-]+\|[ \t:|-]*$/gm, blank) // separadores de tabla
  return t
}

/** ¿Es prosa un literal? Al menos tres palabras, alguna minúscula, y no una
 *  lista de clases CSS, un valor de estilo, una ruta ni un fragmento de código. */
function esProsa(v) {
  const ws = v.trim().split(/\s+/)
  if (ws.length < 3 || !/\p{Ll}/u.test(v)) return false
  if (/[{};=<>]|=>/.test(v)) return false
  const tecnico = (x) => /^[a-z0-9:_/[\]().#%,!-]+$/.test(x)
  if (ws.every(tecnico) && ws.some((x) => /[-:/[(]/.test(x))) return false
  return true
}

/** Para .js/.jsx/.ts/.tsx: deja sólo literales con prosa y texto JSX, línea a línea. */
function stripCode(text) {
  let inBlock = false
  return text
    .split('\n')
    .map((line) => {
      let s = line
      if (inBlock) {
        const end = s.indexOf('*/')
        if (end === -1) return ''
        s = ' '.repeat(end + 2) + s.slice(end + 2)
        inBlock = false
      }
      s = s.replace(/\{?\/\*.*?\*\/\}?/g, blank)
      const open = s.indexOf('/*')
      if (open !== -1) {
        s = s.slice(0, open)
        inBlock = true
      }
      if (/^\s*(import|export \{|\/\/)/.test(s)) return ''
      s = s.replace(/(^|[^:'"`])\/\/.*$/, '$1')
      const out = []
      // literales de cadena
      for (const m of s.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
        const v = m[2].replace(/\$\{[^}]*\}/g, ' ')
        if (esProsa(v)) out.push(v.replace(/\\(['"`])/g, '$1').replace(/\\n/g, ' '))
      }
      // texto JSX: entre > y <, o línea de prosa suelta
      for (const m of s.matchAll(/>([^<>{}]{3,})</g)) out.push(m[1])
      const t = s.trim()
      if (
        out.length === 0 &&
        t &&
        !/^[<{}[\];,)]|^\((?!\p{L})/u.test(t) &&
        !/(=>|=\{|;\s*$|^\w+[:=]\s|\?\.|&&|\|\|)/.test(t) &&
        t.split(/\s+/).length >= 3 &&
        /\p{Ll}/u.test(t)
      )
        out.push(t.replace(/<[^>]*>|\{[^}]*\}/g, ' '))
      return out.join(' · ')
    })
    .join('\n')
}

/** Para .json: los valores de cadena con prosa, en su línea. */
function stripJson(text) {
  return text
    .split('\n')
    .map((line) => {
      const out = []
      for (const m of line.matchAll(/"((?:\\.|[^"\\])*)"(\s*:)?/g)) {
        if (m[2]) continue // clave
        const v = m[1]
        if (v.trim().split(/\s+/).length >= 3 && /\p{Ll}/u.test(v) && !/^https?:/.test(v))
          out.push(
            v
              .replace(/\\n/g, ' ')
              .replace(/\\"/g, '"')
              .replace(/https?:\/\/\S+/g, ' '),
          )
      }
      return out.join(' · ')
    })
    .join('\n')
}

const RE_OTRAS_COMILLAS = [/“[^”]{0,800}”/g, /"[^"\n]{1,300}"/g]
function maskQuotes(text, which) {
  let t = text
  if (which.includes('angular')) t = t.replace(/«[^»]{0,800}»/g, tapa)
  if (which.includes('other')) for (const re of RE_OTRAS_COMILLAS) t = t.replace(re, tapa)
  return t
}
/** Tramos [inicio, fin) de lo que va entre “” o "" (no «»). */
function tramosOtrasComillas(text) {
  const out = []
  for (const re of RE_OTRAS_COMILLAS)
    for (const m of text.matchAll(re)) out.push([m.index, m.index + m[0].length])
  return out
}
const dentro = (tramos, i) => tramos.some(([a, b]) => i >= a && i < b)

// ---------------------------------------------------------------- lemas canónicos
// Se leen de docs/DESCRIPCION.md §Textos canónicos, no de una copia: una lista
// a mano aquí derivaría del documento (la lección del repo con las copias).
// Si el documento no está (el skill copiado fuera del repo), se usan sólo los
// dos one-liners y el informe lo dice.
const RESPALDO_CANONICOS = ['con una fuente para cada cifra', 'with a citation for every figure']
function cargarCanonicos() {
  let md
  try {
    md = readFileSync(new URL('../../../../docs/DESCRIPCION.md', import.meta.url), 'utf8')
  } catch {
    return { frases: RESPALDO_CANONICOS, origen: 'respaldo (no se encontró docs/DESCRIPCION.md)' }
  }
  const i = md.search(/^## Textos canónicos/m)
  if (i === -1) return { frases: RESPALDO_CANONICOS, origen: 'respaldo (sin §Textos canónicos)' }
  const resto = md.slice(i + 3)
  const j = resto.search(/^## /m)
  const seccion = j === -1 ? resto : resto.slice(0, j)
  const parrafos = []
  let cur = []
  for (const l of seccion.split('\n')) {
    const m = l.match(/^>\s?(.*)$/)
    if (m && m[1].trim()) cur.push(m[1])
    else if (cur.length) {
      parrafos.push(cur.join(' '))
      cur = []
    }
  }
  if (cur.length) parrafos.push(cur.join(' '))
  const frases = new Set(RESPALDO_CANONICOS)
  for (const p of parrafos) {
    const limpio = p.replace(/[*_]/g, '').replace(/\s+/g, ' ').trim()
    for (const f of limpio.split(/(?<=[.!?])\s+/)) {
      if (f.split(' ').length >= 5) frases.add(f)
      // un trozo citado suelto («con una fuente para cada cifra»)
      for (const t of f.split(/ — |: /))
        if (t.split(' ').length >= 5) frases.add(t.replace(/[.]$/, ''))
    }
  }
  return { frases: [...frases], origen: 'docs/DESCRIPCION.md §Textos canónicos' }
}
const CANONICOS = cargarCanonicos()
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const RE_CANONICOS = CANONICOS.frases.map(
  (f) =>
    new RegExp(
      f
        .split(' ')
        .map((t) => esc(t))
        .join('[\\s*_>\\u2007]+'),
      'giu',
    ),
)
/** La fórmula del registro de correcciones («Ninguna cifra cambia», «Ningún
 *  otro hecho publicado cambia») es el modelo de prosa de la casa: no es un
 *  absoluto por comprobar. */
const NO_C2 = [
  /(?<![\p{L}])ning[uú]n[oa]? (?:otr[oa] )?(?:cifra|dato|hecho|fecha|importe|nombre|enlace|conclusión)[^.\n]{0,80}?(?:cambia|varía)/giu,
  /(?<![\p{L}])no other (?:figure|fact|date|finding|conclusion)[^.\n]{0,60}? changes?/giu,
]
function tramos(text, res) {
  const out = []
  for (const re of res) {
    re.lastIndex = 0
    for (const m of text.matchAll(re)) out.push([m.index, m.index + m[0].length])
  }
  // fusiona los solapados (un lema entero y su trozo citado son un tramo)
  out.sort((a, b) => a[0] - b[0])
  const fus = []
  for (const t of out) {
    const u = fus[fus.length - 1]
    if (u && t[0] <= u[1]) u[1] = Math.max(u[1], t[1])
    else fus.push([...t])
  }
  return fus
}

// ---------------------------------------------------------------- idioma
const SW = {
  // Sólo palabras que el otro idioma no comparte: «el», «la», «que», «del»,
  // «en» valen en castellano y en valenciano y no deciden nada.
  es: /(?<![\p{L}])(?:los|las|y|pero|más|como|sus|según|sólo|solo|está|están|muy|también|porque|cuando|hay|fue|son|para|por|con|estos|estas|ese|esa|desde|hasta|usted|ustedes|nosotros|tiene|tienen|puede|pueden|cada|año|años|datos|pleno)(?![\p{L}])/giu,
  va: /(?<![\p{L}])(?:els|amb|per a|és|perquè|també|eixe|eixa|eixos|eixes|aquest|aquesta|açò|seu|seua|són|però|què|qui|quan|quant|quins?|quines|com|ho|hi|i|ací|pel|pels|dels|fins|hui|tindre|vosté|fer|pot|poden|dades|diners|ple|veure|fitxa|llei|cada any|anys)(?![\p{L}])|(?<![\p{L}])[lmdsnt][’'](?=\p{L})|\p{L}(?:ció|cions|ix|ixen|ny|l·l)(?![\p{L}])/giu,
  en: /(?<![\p{L}])(?:the|and|of|to|is|are|that|with|for|this|it|on|be|was|which|by|from|has|have|not|we|our)(?![\p{L}])/giu,
}
function detect(s) {
  const c = {}
  for (const k of Object.keys(SW)) c[k] = (s.match(SW[k]) || []).length
  const best = Object.entries(c).sort((a, b) => b[1] - a[1])
  if (best[0][1] < 2 || best[0][1] === best[1][1]) return null
  return best[0][0]
}

// ---------------------------------------------------------------- escaneo
function scanFile(path) {
  let raw
  try {
    raw = readFileSync(path, 'utf8')
  } catch (e) {
    console.log(
      `\n== ${path}\nNo se ha podido leer (${e.code || e.message}). No se ha escaneado nada: esto no es un resultado limpio.`,
    )
    return null
  }
  const ext = extname(path).toLowerCase()
  const plano = opts.plano || ['.txt', '.eml'].includes(ext)
  const esCodigo = ['.js', '.jsx', '.ts', '.tsx', '.mjs'].includes(ext)
  const esDocumento = !esCodigo && !['.json', '.html', '.htm'].includes(ext)

  // Declaración de uso de IA: no se escanea como estilo ni se acorta.
  const declaraciones = []
  raw = raw.replace(
    /<!--\s*declaracion-ia\s*-->[\s\S]*?<!--\s*\/declaracion-ia\s*-->/g,
    (m, off) => {
      const a = raw.slice(0, off).split('\n').length
      declaraciones.push(`L${a}–${a + m.split('\n').length - 1}`)
      return blank(m)
    },
  )

  // Títulos Markdown. En un borrador de formulario son nombres de campo.
  const rawLines0 = raw.split('\n')
  const titulos = esDocumento ? rawLines0.flatMap((l, i) => (/^#{1,6}\s/.test(l) ? [i] : [])) : []
  const titulosCortos = titulos.filter(
    (i) => /^#{2,6}\s/.test(rawLines0[i]) && rawLines0[i].split(/\s+/).length <= 11,
  )
  const pareceFormulario = !opts.campos && esDocumento && titulosCortos.length >= 4
  const campos = esDocumento && (opts.campos || pareceFormulario)
  const sinTitulos = esDocumento && opts.campos

  let prose
  if (esCodigo) prose = stripCode(raw)
  else if (ext === '.json') prose = stripJson(raw)
  else if (ext === '.html' || ext === '.htm')
    prose = raw
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, blank)
      .replace(/<[^>]+>/g, blank)
  else prose = stripMarkdown(raw)
  if (sinTitulos) {
    const ls = prose.split('\n')
    for (const i of titulos) ls[i] = blank(ls[i])
    prose = ls.join('\n')
  }

  const tipo = opts.citas ? prose : maskQuotes(prose, ['angular'])
  const lex = opts.citas ? prose : maskQuotes(prose, ['angular', 'other'])
  // lemas canónicos (no se escanean) y fórmula de correcciones (no es C2)
  const enCanonico = tramos(prose, RE_CANONICOS)
  const enNoC2 = tramos(prose, NO_C2)
  const enOtrasComillas = opts.citas ? [] : tramosOtrasComillas(maskQuotes(prose, ['angular']))

  const lines = prose.split('\n')
  const rawLines = raw.split('\n')
  // idioma por línea, con el del fichero como respaldo
  const fileLang = opts.lang || detect(prose) || 'es'
  const lineLang = lines.map((l) => opts.lang || detect(l) || null)
  // párrafos: bloques separados por línea en blanco (en código/JSON, cada línea)
  const para = []
  let p = 0
  for (let i = 0; i < lines.length; i++) {
    if (esCodigo || ext === '.json') p = i
    else if (rawLines[i] !== undefined && rawLines[i].trim() === '') p++
    para.push(p)
  }
  // el idioma de una línea corta hereda el de su párrafo
  const paraLang = {}
  for (let i = 0; i < lines.length; i++) {
    if (lineLang[i]) paraLang[para[i]] ??= lineLang[i]
  }
  // y si el párrafo tampoco decide, el de la última línea que sí decidió (un
  // bloque `ca:` de un fichero de traducciones sigue en valenciano)
  const sticky = []
  {
    let last = null
    for (let i = 0; i < lines.length; i++) {
      if (lineLang[i]) last = lineLang[i]
      sticky.push(last)
    }
  }
  const langOf = (i) => lineLang[i] || paraLang[para[i]] || sticky[i] || fileLang

  const offsets = []
  {
    let o = 0
    for (const l of lines) {
      offsets.push(o)
      o += l.length + 1
    }
  }
  const lineAt = (idx) => {
    let lo = 0,
      hi = offsets.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (offsets[mid] <= idx) lo = mid
      else hi = mid - 1
    }
    return lo
  }

  const hits = []
  const seen = new Set()
  const push = (id, fiab, li, frag, consejo) => {
    const key = `${id}|${li}|${frag}`
    if (seen.has(key)) return
    seen.add(key)
    hits.push({
      id,
      fiab,
      line: li + 1,
      frag: frag.trim().slice(0, 70),
      consejo,
      para: para[li] ?? li,
    })
  }

  for (const r of R) {
    const src = r.fase === 'crudo' ? raw : r.fase === 'tipo' ? tipo : lex
    r.re.lastIndex = 0
    for (const m of src.matchAll(r.re)) {
      // en crudo el índice es del texto original; las líneas coinciden porque la limpieza las conserva
      const li = r.fase === 'crudo' ? raw.slice(0, m.index).split('\n').length - 1 : lineAt(m.index)
      if (!r.langs.includes('*') && !r.langs.includes(langOf(li))) continue
      if (r.fase !== 'crudo' && dentro(enCanonico, m.index)) continue
      if (r.id === 'C2' && dentro(enNoC2, m.index)) continue
      push(r.id, r.fiab, li, m[0], r.consejo)
    }
    // Lo que va entre “” o "": se lee, pero sale aparte. En inglés suele ser el
    // marco del propio autor («the useful question is not "X"»), no una cita.
    if (r.fase || opts.citas || !(r.fiab === 'fuerte' || r.fiab === 'débil')) continue
    r.re.lastIndex = 0
    for (const m of tipo.matchAll(r.re)) {
      if (!dentro(enOtrasComillas, m.index) || dentro(enCanonico, m.index)) continue
      const li = lineAt(m.index)
      if (!r.langs.includes('*') && !r.langs.includes(langOf(li))) continue
      push(r.id, 'cita', li, m[0], r.consejo)
    }
  }

  // ¿ ¡ que faltan (castellano)
  lines.forEach((l, i) => {
    if (langOf(i) !== 'es') return
    // el valenciano no usa ¿: una sola señal valenciana en la línea basta para no exigirlo
    SW.va.lastIndex = 0
    if (!opts.lang && SW.va.test(l)) return
    const masked = maskQuotes(l, ['angular', 'other'])
    for (const m of masked.matchAll(/[\p{L}»)]\?/gu)) {
      const before = masked.slice(0, m.index)
      const start = Math.max(
        before.lastIndexOf('.'),
        before.lastIndexOf('!'),
        before.lastIndexOf('?'),
        before.lastIndexOf('·'),
      )
      if (!masked.slice(start + 1, m.index).includes('¿'))
        push(
          'F3',
          'norma',
          i,
          masked.slice(Math.max(start + 1, m.index - 40), m.index + 1),
          'falta el signo de apertura ¿',
        )
    }
  })

  // Title Case en títulos Markdown. En un borrador de formulario los títulos
  // son los nombres de campo de la convocatoria, copiados tal cual: no se miran.
  rawLines.forEach((l, i) => {
    const esTitulo = /^#{1,6}\s/.test(l)
    if (esTitulo && campos) return
    const m =
      l.match(/^#{1,6}\s+(.+)$/) || l.match(/^\s*(?:Asunto|Subject|Assumpte|Títol|Title):\s*(.+)$/i)
    if (!m) return
    const lang = langOf(i)
    const words = m[1]
      .replace(/[`*_]/g, '')
      .split(/\s+/)
      .filter((x) => /^\p{L}/u.test(x))
    const small =
      /^(de|del|la|las|el|los|y|e|o|en|a|con|por|para|un|una|the|of|and|or|in|on|to|a|an|for|with|i|amb|per|dels|els|les)$/i
    const content = words.slice(1).filter((x) => !small.test(x))
    const caps = content.filter((x) => /^\p{Lu}/u.test(x))
    if (content.length >= 2 && caps.length === content.length)
      push(
        'F1',
        lang === 'en' ? 'estilo' : 'norma',
        i,
        m[1],
        lang === 'en'
          ? 'Title Case heading: a valid English style; sentence case only if the destination uses it'
          : 'título en Title Case: en castellano y valenciano sólo la primera palabra y los nombres propios',
      )
  })

  // Formato Markdown. En un destino plano es un error contra el destino
  // ('norma': se quita siempre, y sola no dice nada de autoría; el ensayo ruso
  // la da por fuerte sólo junto a otras marcas o con sintaxis rota). En un
  // .md, la viñeta con rótulo en negrita y la negrita repartida por el cuerpo
  // son débiles.
  rawLines.forEach((l, i) => {
    if (campos && /^#{1,6}\s/.test(l)) return
    if (/^\s*(?:[-*+•]|\d+[.)])\s+\*\*[^*]{1,60}\*\*\s*:?/.test(l) && /:\*\*|\*\*\s*:/.test(l))
      push(
        'F8',
        plano ? 'norma' : 'débil',
        i,
        l,
        plano
          ? 'viñeta con rótulo en negrita en un destino sin Markdown: quítala'
          : 'viñeta con rótulo en negrita: vale en documentos de la casa; en un formulario o carta, prosa',
      )
    if (!plano) {
      const negritas = (l.match(/\*\*[^*\n]+\*\*/g) || []).length
      if (negritas >= 3 && !/^\s*(?:[-*+•|]|\d+[.)])/.test(l))
        push(
          'F8',
          'débil',
          i,
          l,
          'negrita repartida por el cuerpo: destaca sólo lo que el lector no puede perderse (que no la haya no prueba nada)',
        )
      return
    }
    if (/\*\*[^*\n]+\*\*|__[^_\n]+__/.test(l))
      push('F8', 'norma', i, l, 'negrita Markdown en un destino que no la renderiza: quítala')
    if (/^#{1,6}\s/.test(l))
      push('F8', 'norma', i, l, 'título Markdown en un destino que no lo renderiza: quítalo')
    if (/^\s*(?:---|\*\*\*)\s*$/.test(l)) push('F8', 'norma', i, l, 'separador Markdown: quítalo')
    if (/\[[^\]\n]+\]\([^)\n]+\)/.test(l))
      push('F8', 'norma', i, l, 'enlace Markdown: pon la URL a la vista')
  })
  rawLines.forEach((l, i) => {
    // sólo emoji de presentación gráfica: ↗ y ⚠︎ (con selector de texto) son signos de interfaz
    const e = l.match(/\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F/u)
    if (e && !/[✅❌]/u.test(e[0])) push('F8', plano ? 'norma' : 'débil', i, l, 'emoji en prosa')
  })

  // ------------------------------------------------ cifras de conjunto
  const words = (lex.match(/\p{L}[\p{L}'’-]*/gu) || []).length
  const sentences = lex
    .replace(/·/g, '.')
    .split(/(?<=[.!?])\s+|\n\s*\n/)
    .map((s) => (s.match(/\p{L}[\p{L}'’-]*/gu) || []).length)
    .filter((n) => n >= 3)
  const mean = sentences.reduce((a, b) => a + b, 0) / (sentences.length || 1)
  const sd = Math.sqrt(sentences.reduce((a, b) => a + (b - mean) ** 2, 0) / (sentences.length || 1))
  const notas = []
  if (sentences.length >= 10 && mean >= 8 && mean <= 20 && sd / mean < 0.35)
    notas.push(
      `ritmo uniforme: ${sentences.length} frases, media ${mean.toFixed(1)} palabras, desviación ${sd.toFixed(1)} (E6, débil). No es motivo de cambio por sí solo: cambia una frase sólo si al lector le cuesta seguirla, y nunca partas un matiz de su cifra.`,
    )
  if (fileLang === 'en' && sentences.length >= 10) {
    const varied = (lex.match(/[;:()]|—/g) || []).length
    if (varied === 0)
      notas.push(
        'only commas and full stops across 10+ sentences (E6, weak). Not a reason to edit on its own.',
      )
  }
  const e5 = hits.filter((h) => h.id === 'E5').length
  if (e5 >= 3) notas.push(`${e5} párrafos abren con conector (E5): en racimo sí es marca.`)
  if (pareceFormulario)
    notas.push(
      `parece un borrador de formulario (${titulosCortos.length} títulos cortos): los títulos se han tomado por nombres de campo y F1/F8 no los miran. Con --campos sale el informe campo a campo, que es lo que se pega.`,
    )
  if (declaraciones.length)
    notas.push(
      `declaración de uso de IA saltada (${declaraciones.join(', ')}): no se escanea como estilo ni se acorta.`,
    )
  if (enCanonico.length)
    notas.push(
      `${enCanonico.length} tramo(s) de lema canónico reconocido(s) y no escaneado(s) (fuente: ${CANONICOS.origen}).`,
    )

  // campo a campo (--campos): las palabras y las marcas de lo que se pega
  let porCampo = null
  if (opts.campos && titulos.length) {
    porCampo = []
    for (let k = 0; k < titulos.length; k++) {
      const a = titulos[k]
      const b = k + 1 < titulos.length ? titulos[k + 1] : rawLines.length
      // se cuenta como cuenta un formulario: el texto que se pega, citas y
      // URL incluidas, separado por espacios
      const pegado = rawLines
        .slice(a + 1, b)
        .join('\n')
        .trim()
      const n = pegado.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length
      if (!n) continue
      const hs = hits.filter((h) => h.line - 1 > a && h.line - 1 < b)
      porCampo.push({
        campo: rawLines[a].replace(/^#+\s*/, '').trim(),
        palabras: n,
        caracteres: [...pegado].length,
        fuertes: hs.filter((h) => h.fiab === 'fuerte').length,
        debiles: hs.filter((h) => h.fiab === 'débil').length,
        norma: hs.filter((h) => h.fiab === 'norma').length,
        verdad: hs.filter((h) => h.fiab === 'verdad').length,
      })
    }
  }

  return { path, words, hits, notas, fileLang, plano, esCodigo, ext, porCampo }
}

// ---------------------------------------------------------------- informe
const ORDEN = { fuerte: 0, débil: 1, norma: 2, estilo: 3, cita: 4, verdad: 5, pendiente: 6 }
let total = 0
for (const f of files) {
  const r = scanFile(f)
  if (!r) continue
  total++
  const { hits, words } = r
  hits.sort((a, b) => a.line - b.line || ORDEN[a.fiab] - ORDEN[b.fiab])
  const modo = [
    r.esCodigo ? 'literales y texto JSX' : r.ext === '.json' ? 'valores de cadena' : 'prosa',
    r.plano ? 'destino plano' : null,
    opts.campos ? 'campo a campo, sin títulos' : null,
    opts.citas ? 'con citas' : 'citas «» saltadas, “” "" aparte',
  ]
    .filter(Boolean)
    .join(' · ')
  console.log(`\n== ${f}  (${words} palabras leídas · idioma base ${r.fileLang} · ${modo})`)
  if (words === 0) {
    console.log(
      '0 palabras de prosa leídas: el escáner no ha evaluado nada. Esto NO es un resultado limpio; revisa el tipo de fichero o pásalo como .txt.',
    )
    continue
  }
  // Sólo «fuerte» y «débil» son marcas: cuentan para la densidad y los racimos.
  const marcas = hits.filter((h) => h.fiab === 'fuerte' || h.fiab === 'débil')
  for (const h of hits.filter((x) => !['verdad', 'cita'].includes(x.fiab)))
    console.log(
      `L${String(h.line).padEnd(5)} ${h.id.padEnd(3)} ${h.fiab.padEnd(9)} «${h.frag.replace(/\s+/g, ' ')}» → ${h.consejo}`,
    )
  const citas = hits.filter((h) => h.fiab === 'cita')
  if (citas.length) {
    console.log(
      `\n-- Dentro de “” o "" (${citas.length}): si es una cita de una fuente, es prueba y se queda; si es tu propio marco, léelo como marca`,
    )
    for (const h of citas)
      console.log(`L${String(h.line).padEnd(5)} ${h.id.padEnd(3)} «${h.frag.replace(/\s+/g, ' ')}»`)
  }
  const verdad = hits.filter((h) => h.fiab === 'verdad')
  const esUniversal = (h) => /^universal/.test(h.consejo)
  for (const [titulo, grupo] of [
    [
      'Absolutos que hay que comprobar (C2; no son estilo, son afirmaciones)',
      verdad.filter((h) => !esUniversal(h)),
    ],
    [
      'Universales («cada», «todos los», «every»; C2, casi siempre ciertos: mira los que hablan de lo que hace la máquina)',
      verdad.filter(esUniversal),
    ],
  ]) {
    if (!grupo.length) continue
    console.log(`\n-- ${titulo}: ${grupo.length}`)
    const byLine = {}
    for (const h of grupo) (byLine[h.line] ??= []).push(h.frag)
    const ls = Object.keys(byLine)
    console.log(
      ls
        .slice(0, 25)
        .map((l) => `L${l} ${byLine[l].join(', ')}`)
        .join(' · ') + (ls.length > 25 ? ` · … y ${ls.length - 25} líneas más` : ''),
    )
  }
  if (r.porCampo) {
    console.log(
      '\n-- Campo a campo (compara las palabras con el límite de cada campo en las notas)',
    )
    for (const c of r.porCampo)
      console.log(
        `${String(c.palabras).padStart(5)} palabras · ${String(c.caracteres).padStart(5)} caracteres · fuertes ${c.fuertes} · débiles ${c.debiles} · norma ${c.norma} · absolutos ${c.verdad} · ${c.campo.slice(0, 70)}`,
      )
  }
  // racimos: sólo marcas de máquina; los errores de norma no entran
  const porParrafo = {}
  for (const h of marcas) (porParrafo[h.para] ??= []).push(h)
  const racimos = Object.values(porParrafo).filter(
    (xs) => xs.length >= 3 || (xs.some((x) => x.fiab === 'fuerte') && xs.length >= 2),
  )
  const cuenta = (fi) => hits.filter((h) => h.fiab === fi).length
  const porId = {}
  for (const h of marcas) porId[h.id] = (porId[h.id] || 0) + 1
  console.log('\n-- Resumen')
  console.log(
    `marcas fuertes: ${cuenta('fuerte')} · débiles: ${cuenta('débil')} · errores de norma: ${cuenta('norma')} · preferencias de estilo: ${cuenta('estilo')} · dentro de comillas: ${cuenta('cita')} · absolutos a comprobar: ${cuenta('verdad')} · huecos pendientes: ${cuenta('pendiente')}`,
  )
  console.log(
    `densidad: ${((marcas.length / words) * 1000).toFixed(1)} marcas por 1.000 palabras (sin errores de norma, estilo ni comillas)`,
  )
  console.log(
    `por entrada del catálogo: ${
      Object.entries(porId)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k} ${v}`)
        .join(', ') || '—'
    }`,
  )
  console.log(
    `racimos (párrafos con ≥3 marcas, o ≥2 con una fuerte; sin errores de norma): ${racimos.length ? racimos.map((xs) => `L${xs[0].line}`).join(', ') : 'ninguno'}`,
  )
  if (cuenta('norma'))
    console.log('errores de norma: corrígelos siempre; no dicen nada de quién escribió el texto.')
  for (const n of r.notas) console.log(`nota: ${n}`)
  if (cuenta('pendiente'))
    console.log(
      'ATENCIÓN: quedan huecos o plantillas sin rellenar; el texto no está listo para enviarse.',
    )
}
console.log(
  `\n${total} fichero(s) escaneado(s). Esto es una lista de sitios donde mirar, no un veredicto.` +
    '\nUn recuento bajo NO prueba que lo escribiera una persona, y uno alto no prueba que lo escribiera una máquina.' +
    '\nEl escáner no ve lo que más importa: si cada cifra, cita y fuente sigue diciendo lo que decía antes de reescribir.' +
    '\nUna marca que no daña al lector se señala y no se reescribe; nada de esto sirve para ajustar un texto a un detector.',
)
process.exit(0)
