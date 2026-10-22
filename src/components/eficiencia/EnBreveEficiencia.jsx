import EnBreve, { TarjetaEnBreve } from '../EnBreve'
import { enBreveEficiencia } from '../../scraper/en-breve-eficiencia'
import { rellena } from '../../lib/formatters'
import { useT } from '../../i18n'

/*
 * «En breve» de /eficiencia: cuatro preguntas de vecino sobre el panel, encima
 * del libro. Las cifras las deriva `scraper/en-breve-eficiencia` con los mismos
 * cálculos que las secciones a las que enlaza; aquí sólo se eligen las frases,
 * con las claves literales en su llamada (guard de `i18n-catalogue`).
 *
 * La pregunta «¿es caro?» no tiene tarjeta: la contesta, servicio a servicio,
 * «Cuesta · Consigue · Responde», justo debajo. Y la de «¿lo hacen bien?» dice
 * lo que el panel puede y lo que no: la conclusión, si la hay, es la opinión
 * firmada de arriba, nunca esta tarjeta.
 */

const eurM = (n) =>
  `${(n / 1e6).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M€`
const num = (n) => n.toLocaleString('es-ES', { maximumFractionDigits: 2 })

function FiguraCoste({ coste, t }) {
  const filas = [
    ...coste.filas.map((f) => ({ ...f, resto: false })),
    ...(coste.resto > 0
      ? [
          {
            id: 'resto',
            etiqueta: t('eficiencia.enBreve.coste.resto'),
            coste: coste.resto,
            cuota: coste.resto / coste.total,
            resto: true,
          },
        ]
      : []),
  ]
  return (
    <div
      className="cp-en-breve-figura"
      role="img"
      aria-label={filas.map((f) => `${f.etiqueta} ${eurM(f.coste)}`).join(', ')}
      style={{ gap: 8 }}
    >
      {filas.map((f, i) => (
        <div key={f.id} aria-hidden="true">
          <div className="cp-en-breve-fila">
            <span>{f.etiqueta}</span>
            <span className="mono">{eurM(f.coste)}</span>
          </div>
          <div
            className="cp-en-breve-barra"
            style={{ height: 6, borderRadius: 'var(--r-pill)', marginTop: 3 }}
          >
            <div
              className="cp-crece-x"
              style={{
                width: `${f.cuota * 100}%`,
                background: f.resto ? 'var(--ink30)' : 'var(--civic)',
                borderRadius: 'inherit',
                '--i': i,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * La cifra quieta: un recuadro por año, y dentro el MISMO número. Sin
 * animación: los recuadros llevan texto, y aquí sólo se mueven marcas, nunca
 * texto (`hooks/useRevelado`). A medio entrar, además, su texto tenía un
 * contraste que axe suspendía.
 */
function FiguraCongelada({ ejemplo, t }) {
  return (
    <div className="cp-en-breve-figura">
      <ol
        className="cp-efi-congelada"
        aria-label={rellena(t('eficiencia.enBreve.bien.figura'), {
          unidad: ejemplo.unidad,
          servicio: ejemplo.etiqueta.toLowerCase(),
          valor: num(ejemplo.valor),
          desde: ejemplo.desde,
          hasta: ejemplo.anios[ejemplo.anios.length - 1],
        })}
      >
        {ejemplo.anios.map((a) => (
          <li key={a}>
            <span className="cp-efi-congelada-anio">{a}</span>
            <span className="mono cp-efi-congelada-valor">{num(ejemplo.valor)}</span>
          </li>
        ))}
      </ol>
      <div className="cp-en-breve-leyenda" aria-hidden="true">
        <span>
          {ejemplo.unidad} · {ejemplo.etiqueta}
        </span>
      </div>
    </div>
  )
}

function FiguraEntregas({ entregas, anios, t }) {
  return (
    <div className="cp-en-breve-figura">
      <ol
        className="cp-efi-entregas"
        aria-label={rellena(t('eficiencia.enBreve.entregas.figura'), {
          presentadas: entregas.presentadas,
          obligatorias: entregas.obligatorias,
        })}
      >
        {anios.map((a) => {
          const falta = entregas.faltan.includes(a)
          return (
            <li key={a} className={falta ? 'cp-efi-entrega-falta' : undefined}>
              <span>{a}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export default function EnBreveEficiencia({ data, preguntas }) {
  const t = useT()
  const r = enBreveEficiencia(data ?? {}, preguntas)
  const ver = t('eficiencia.enBreve.ver')
  const tarjetas = []

  if (r.coste) {
    const c = r.coste
    tarjetas.push(
      <TarjetaEnBreve
        key="coste"
        id="coste"
        pregunta={t('eficiencia.enBreve.coste.pregunta')}
        cifra={eurM(c.total)}
        cifraNota={rellena(t('eficiencia.enBreve.coste.nota'), { n: c.n, anio: c.anio })}
        figura={<FiguraCoste coste={c} t={t} />}
        frases={[rellena(t('eficiencia.enBreve.coste.frase'), { n: c.n, anio: c.anio })]}
        ancla="#sec-servicios"
        anclaTexto={ver}
      />,
    )
  }

  if (r.congelado) {
    const g = r.congelado
    const e = g.ejemplo
    tarjetas.push(
      <TarjetaEnBreve
        key="bien"
        id="bien"
        pregunta={t('eficiencia.enBreve.bien.pregunta')}
        cifra={rellena(t('eficiencia.enBreve.bien.cifra'), { n: g.n, de: g.de })}
        cifraNota={t('eficiencia.enBreve.bien.cifraNota')}
        figura={e ? <FiguraCongelada ejemplo={e} t={t} /> : undefined}
        frases={[
          t('eficiencia.enBreve.bien.frase'),
          rellena(t('eficiencia.enBreve.bien.razon'), { n: g.n, de: g.de }),
          e
            ? rellena(t('eficiencia.enBreve.bien.ejemplo'), {
                valor: num(e.valor),
                unidad: e.unidad,
                servicio: e.etiqueta.toLowerCase(),
                desde: e.desde,
              })
            : '',
        ]}
        ancla="#sec-declaracion"
        anclaTexto={ver}
      />,
    )
  }

  if (r.entregas) {
    const en = r.entregas
    tarjetas.push(
      <TarjetaEnBreve
        key="entregas"
        id="entregas"
        pregunta={t('eficiencia.enBreve.entregas.pregunta')}
        cifra={rellena(t('eficiencia.enBreve.entregas.cifra'), {
          presentadas: en.presentadas,
          obligatorias: en.obligatorias,
        })}
        figura={
          <FiguraEntregas entregas={en} anios={data?.cobertura?.entregasPublicadas ?? []} t={t} />
        }
        frases={[
          en.faltan.length
            ? rellena(t('eficiencia.enBreve.entregas.frase'), {
                presentadas: en.presentadas,
                obligatorias: en.obligatorias,
                faltan: en.faltan.join(', '),
              })
            : rellena(t('eficiencia.enBreve.entregas.todas'), { obligatorias: en.obligatorias }),
        ]}
        ancla="#sec-entregas"
        anclaTexto={ver}
      />,
    )
  }

  if (r.preguntas) {
    tarjetas.push(
      <TarjetaEnBreve
        key="preguntas"
        id="preguntas"
        pregunta={t('eficiencia.enBreve.preguntas.pregunta')}
        cifra={String(r.preguntas.n)}
        cifraNota={t('eficiencia.enBreve.preguntas.cifraNota')}
        frases={[rellena(t('eficiencia.enBreve.preguntas.frase'), { n: r.preguntas.n })]}
        nota={t('eficiencia.enBreve.preguntas.nota')}
        ancla="#sec-preguntas"
        anclaTexto={ver}
      />,
    )
  }

  if (tarjetas.length === 0) return null
  return (
    <div style={{ marginTop: 28 }}>
      <EnBreve
        titulo={t('eficiencia.enBreve.titulo')}
        intro={t('eficiencia.enBreve.intro')}
        saltarA="#sec-servicios"
        saltarTexto={t('eficiencia.enBreve.saltar')}
      >
        {tarjetas}
      </EnBreve>
    </div>
  )
}
