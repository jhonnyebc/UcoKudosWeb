import { useEffect, useState } from 'react';

import {
  activarAvisos,
  desactivarAvisos,
  estadoDelNavegador,
  sincronizarSuscripcion,
  type EstadoPush,
} from '../avisos/push';
import { useSesion } from '../autenticacion/useSesion';

/**
 * El control para activar los avisos en el celular.
 *
 * **El permiso se pide al tocar este botón y en ningún otro momento.** Pedirlo al cargar la página
 * es la forma más rápida de que lo denieguen para siempre: el usuario todavía no sabe qué es la
 * aplicación, dice que no, y el navegador recuerda esa negativa. Preguntarlo cuando alguien lo pide
 * explícitamente convierte el permiso en una decisión informada.
 */
export function BotonAvisosPush() {
  const { estaDentro } = useSesion();
  const [estado, setEstado] = useState<EstadoPush>(estadoDelNavegador);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!estaDentro) {
      return;
    }

    // Al entrar se vuelve a registrar la suscripción que ya hubiera: el navegador puede haberla
    // renovado por su cuenta, y entonces la que el servidor guarda ya no sirve.
    sincronizarSuscripcion()
      .then(setEstado)
      .catch(() => setEstado(estadoDelNavegador()));
  }, [estaDentro]);

  if (!estaDentro || estado === 'no-soportado') {
    return null;
  }

  if (estado === 'denegado') {
    return (
      <p className="meta">
        Bloqueaste los avisos en este navegador. Para recibirlos, habilítalos en los ajustes del
        sitio.
      </p>
    );
  }

  async function alternar() {
    setTrabajando(true);
    setError(null);

    try {
      setEstado(estado === 'activo' ? await desactivarAvisos() : await activarAvisos());
    } catch {
      setError('No se pudo cambiar los avisos. Inténtalo de nuevo.');
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="secundario"
        onClick={() => void alternar()}
        disabled={trabajando}
      >
        {estado === 'activo' ? 'Desactivar avisos' : 'Activar avisos en este dispositivo'}
      </button>

      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
