// @ts-check
import { CAUSA_ETIQUETA } from '../../../lib/incendios'

// Un popup de Leaflet es siempre blanco, mire el tema lo que mire, así que
// esta ficha lleva su propia tinta fija — el mismo convenio que ContractCard.
const INK = '#0B0F19'
const INK70 = 'rgba(11,15,25,.7)'
const INK55 = 'rgba(11,15,25,.55)'

const etiqueta = {
  fontFamily: "'DM Mono', monospace",
  fontSize: 'var(--fs-micro)',
  color: INK55,
  letterSpacing: '.06em',
  textTransform: 'uppercase',
}

const fecha = (iso) => {
  if (!iso) return null
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

/**
 * Ficha de un incendio. Cita el parte oficial —que es lo que la hace
 * verificable— y dice dos cosas que el número solo no dice:
 *
 * - la superficie es la del incendio COMPLETO, no la parte que ardió dentro
 *   del término, porque recortarla daría una cifra nuestra con firma ajena;
 * - si la GVA lo archiva en otro municipio, se dice, en vez de dejar que el
 *   lector suponga que todo lo pintado es de Riba-roja.
 */
export function IncendioPopup({ incendio, fuente }) {
  const i = incendio
  const causaConocida = i.causa !== 'sinClasificar'
  return (
    <div style={{ fontFamily: 'Outfit, system-ui, sans-serif', minWidth: 250, maxWidth: 320 }}>
      <div style={{ fontSize: 'var(--fs-body)', fontWeight: 700, color: INK }}>
        {i.paraje || `Incendio de ${i.anyo}`}
      </div>

      <div style={{ marginTop: 4, display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span
          style={{ fontFamily: "'DM Mono', monospace", fontSize: 'var(--fs-meta)', color: INK }}
        >
          {i.superficieHa.toLocaleString('es-ES', { maximumFractionDigits: 2 })} ha
        </span>
        <span style={{ ...etiqueta, textTransform: 'none' }}>superficie del incendio completo</span>
      </div>

      {!i.propio && (
        // La atribución oficial es de otro pueblo. Se dice aquí, no se
        // esconde: el perímetro entra en Riba-roja, el parte no.
        <div style={{ marginTop: 6, fontSize: 'var(--fs-aux)', color: INK70 }}>
          Atribuido por la Generalitat a <strong>{i.municipio}</strong>; su perímetro entra en
          Riba-roja.
        </div>
      )}

      <div
        style={{ marginTop: 8, display: 'grid', gap: 3, fontSize: 'var(--fs-aux)', color: INK70 }}
      >
        <div>
          <span style={etiqueta}>Detectado</span> {fecha(i.detectadoEl) ?? 'sin fecha en el parte'}
          {i.horaDeteccion ? ` · ${i.horaDeteccion}` : ''}
        </div>
        {i.extinguidoEl && (
          <div>
            <span style={etiqueta}>Extinguido</span> {fecha(i.extinguidoEl)}
          </div>
        )}
        <div>
          <span style={etiqueta}>Causa</span>{' '}
          {causaConocida ? (
            CAUSA_ETIQUETA[i.causa]
          ) : (
            // «Otras Causas» y «Causa desconocida» significan «no se sabe».
            // Publicarlas como una causa las convertiría en un hecho.
            <span style={{ color: INK55 }}>no consta en el parte</span>
          )}
        </div>
        {(i.arboladaHa > 0 || i.noArboladaHa > 0) && (
          <div>
            <span style={etiqueta}>Reparto</span>{' '}
            {i.arboladaHa.toLocaleString('es-ES', { maximumFractionDigits: 2 })} ha arboladas ·{' '}
            {i.noArboladaHa.toLocaleString('es-ES', { maximumFractionDigits: 2 })} ha no arboladas
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 8,
          paddingTop: 6,
          borderTop: '1px solid #E6E1D4',
          fontSize: 'var(--fs-micro)',
          color: INK55,
          fontFamily: "'DM Mono', monospace",
          letterSpacing: '.03em',
        }}
      >
        Parte {i.id} · {fuente?.atribucion ?? 'Institut Cartogràfic Valencià (ICV)'}
      </div>
    </div>
  )
}
