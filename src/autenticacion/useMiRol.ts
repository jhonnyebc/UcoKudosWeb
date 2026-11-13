import { useEffect, useState } from 'react';

import { pedir } from '../api/cliente';
import type { PersonaConSolicitud } from '../api/tipos';
import { useSesion } from './useSesion';

/**
 * El rol de quien está dentro, para decidir qué botones y pestañas enseñar.
 *
 * **Es comodidad, no seguridad**, igual que `ExigeSesion`: esconder «Vetar» a un estudiante le
 * ahorra un botón que fallaría, pero lo que impide vetar es la API. Si la consulta falla, devuelve
 * `null` y la interfaz se queda con lo básico: un fallo aquí no debe romper la aplicación.
 *
 * El resultado se **guarda por persona**: el muro pinta una tarjeta por Kudo y cada una pregunta
 * por el rol, y sin esto serían veinte peticiones iguales por página.
 */
const consultas = new Map<string, Promise<string | null>>();

function consultarRol(personaId: string): Promise<string | null> {
  let consulta = consultas.get(personaId);

  if (consulta === undefined) {
    consulta = pedir<PersonaConSolicitud>('/identidad/yo')
      .then((perfil) => perfil.rol)
      .catch(() => {
        // Que se pueda volver a intentar: un fallo de red no debe quedar guardado para siempre.
        consultas.delete(personaId);
        return null;
      });
    consultas.set(personaId, consulta);
  }

  return consulta;
}

export function useMiRol(): string | null {
  const { estaDentro, personaId } = useSesion();
  const [rol, setRol] = useState<string | null>(null);

  useEffect(() => {
    if (!estaDentro || personaId === null) {
      setRol(null);
      return;
    }

    let cancelado = false;

    void consultarRol(personaId).then((valor) => {
      if (!cancelado) {
        setRol(valor);
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

/** RF-12: solo el Rector y el Coordinador Académico moderan. El Administrador no. */
export function puedeVetar(rol: string | null): boolean {
  return rol === 'Rector' || rol === 'Coordinador Académico';
}

/** Administrar facultades y programas: Administrador, Rector y Coordinador Académico. */
export function administraEstructura(rol: string | null): boolean {
  return rol === 'Administrador del Sistema' || rol === 'Rector' || rol === 'Coordinador Académico';
}

/**
 * Los roles que cada rol puede asignar: la cadena del enunciado, la misma de las aprobaciones. Es
 * comodidad para no ofrecer lo que la API rechazaría; la regla la aplica la API.
 */
export function rolesQueAsigna(rol: string | null): readonly string[] {
  switch (rol) {
    case 'Coordinador de Programa':
      return ['Docente', 'Estudiante'];
    case 'Coordinador de Facultad':
      return ['Coordinador de Programa'];
    case 'Coordinador Académico':
      return ['Coordinador de Facultad'];
    case 'Rector':
      return ['Coordinador Académico'];
    case 'Administrador del Sistema':
      return ['Rector', 'Administrador del Sistema'];
    default:
      return [];
  }
}

/** Para las pruebas: olvida lo guardado. */
export function olvidarRoles(): void {
  consultas.clear();
}
