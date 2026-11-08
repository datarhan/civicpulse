/**
 * Lo que sólo tiene sentido con DOM. Lo carga `setup.ts`, que mira si lo hay:
 * cargarlo cuesta más que muchos ficheros de pruebas enteros, y un `.ts` en Node
 * no monta nada que limpiar ni nada que comparar con `toBeInTheDocument`.
 */
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})
