import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ErrorDeApi, pedir } from '../api/cliente';
import type { DetalleKudo } from '../api/tipos';
import { TarjetaDeKudo } from '../componentes/TarjetaDeKudo';

/**
 * Un Kudo en su propia pantalla, con el hilo de respuestas ya abierto.
 *
 * Existe por dos razones. La primera, que el enunciado habla de consultar un Kudo, no solo de verlo
 * entre otros en el muro. La segunda, que **los avisos apuntan aquí**: el correo, el aviso dentro de
 * la aplicación y la notificación push llevan a `/kudos/{id}`, y mientras esta ruta no existía
 * abrirlos caía en «Esta página no existe».
 */
export function DetalleDeKudo() {
  const { id } = useParams<{ id: string }>();
  const [detalle, setDetalle] = useState<DetalleKudo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setDetalle(null);
    setError(null);

    pedir<DetalleKudo>(`/kudos/${id ?? ''}`)
      .then((d) => {
        if (!cancelado) {
          setDetalle(d);
        }
      })
      .catch((causa: unknown) => {
        if (!cancelado) {
          setError(
            causa instanceof ErrorDeApi && causa.estado !== 404
              ? causa.message
              : 'Este reconocimiento no existe o ya no está disponible.',
          );
        }
      });

    return () => {
      cancelado = true;
    };
  }, [id]);

  return (
    <>
      <h1>Reconocimiento</h1>

      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {error === null && detalle === null && <p role="status">Cargando…</p>}

      {detalle !== null && <TarjetaDeKudo kudo={detalle.kudo} enDetalle />}

      <p>
        <Link to="/">Volver al muro</Link>
      </p>
    </>
  );
}
