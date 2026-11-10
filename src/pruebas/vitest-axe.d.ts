/**
 * Los tipos de las aserciones de accesibilidad.
 *
 * La biblioteca añade `toHaveNoViolations` en tiempo de ejecución pero no declara el tipo para
 * Vitest, así que sin esto el compilador rechaza la prueba. Está aparte y comentado para que no
 * parezca un parche misterioso.
 */
import 'vitest';

interface AserccionesDeAccesibilidad<R = unknown> {
  toHaveNoViolations(): R;
}

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Assertion<T = unknown> extends AserccionesDeAccesibilidad<T> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends AserccionesDeAccesibilidad {}
}
