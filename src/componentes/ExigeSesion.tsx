import type { ReactNode } from 'react';

import { useSesion } from '../autenticacion/useSesion';

/**
 * Envuelve lo que solo tiene sentido con la sesión iniciada.
 *
 * **Esto no es un control de acceso y es importante no confundirlo con uno.** Es comodidad: evita
 * que el usuario rellene un formulario para que la API se lo rechace al final. Cualquiera puede
 * saltarse este componente con las herramientas del navegador, y no pasa nada, porque **la regla
 * la aplica la API** (ADR-0004, ADR-0015 punto 8). Si proteger una pantalla aquí fuera lo único
 * que impide una acción, esa acción estaría sin proteger.
 */
export function ExigeSesion({ children, que }: { children: ReactNode; que: string }) {
  const { estaDentro, hayProveedor, entrar } = useSesion();

  if (estaDentro) {
    return <>{children}</>;
  }

  if (!hayProveedor) {
    return (
      <p>
        Para {que} hace falta iniciar sesión, y todavía no hay un proveedor de identidad conectado
        en este entorno.
      </p>
    );
  }

  return (
    <>
      <p>Para {que} necesitas iniciar sesión.</p>
      <button type="button" onClick={entrar}>
        Entrar
      </button>
    </>
  );
}
