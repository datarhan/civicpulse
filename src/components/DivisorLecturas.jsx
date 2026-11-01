import { useLocale } from '../i18n'
import { VerLecturas } from './Lecturas'

/*
 * El paso de una lectura a la otra: «Hasta aquí, lo esencial. Debajo, todos
 * los datos, para quien quiera comprobarlos».
 *
 * Es la reducción de carga más barata del plan de las dos lecturas (auditoría
 * del 25-10-2026): le dice a un vecino que puede parar ahí, y a quien sigue,
 * que lo de abajo es el detalle que sostiene lo de arriba, no otra cosa. Va en
 * cada página que tenga las dos lecturas, entre la vecinal y la experta, y no
 * se pliega nunca.
 *
 * Debajo lleva el control del pliegue, «Ver: lo esencial · todo»
 * (`Lecturas.jsx`): justo donde empieza lo que pliega.
 */
export default function DivisorLecturas() {
  const { t } = useLocale()
  return (
    <>
      <p className="cp-divisor-lecturas" data-divisor-lecturas="">
        <span>{t('lecturas.divisor')}</span>
      </p>
      <VerLecturas />
    </>
  )
}
