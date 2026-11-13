import { useEffect, useState } from 'react';

import { pedir } from '../api/cliente';
import type { PersonaConSolicitud } from '../api/tipos';
import { useSesion } from './useSesion';

/**
 * El rol de quien está dentro, para decidir qué pestañas enseñar.
 *
 * **Es comodidad, no seguridad**, igual que `ExigeSesion`: esconder «Solicitudes» a un estudiante
 * le ahorra una pantalla vacía, pero lo que impide aprobar es la API. Si la consulta falla, devuelve
 * `null` y la navegación se queda con lo básico: un fallo aquí no debe romper la aplicación.
 */
export function useMiRol(): string | null {
  const { estaDentro, personaId } = useSesion();
  const [rol, setRol] = useState<string | null>(null);

  useEffect(() => {
    if (!estaDentro) {
      setRol(null);
      return;
    }

    let cancelado = false;

    pedir<PersonaConSolicitud>('/identidad/yo')
      .then((perfil) => {
        if (!cancelado) {
          setRol(perfil.rol);
        }
      })
      .catch(() => {
        if (!cancelado) {
          setRol(null);
        }
      });

    return () => {
      cancelado = true;
    };
  }, [estaDentro, personaId]);

  return rol;
}

/** Los roles que no aprueban solicitudes: los de base de la jerarquía. */
export function apruebaSolicitudes(rol: string | null): boolean {
  return rol !== null && rol !== 'Docente' && rol !== 'Estudiante';
}
