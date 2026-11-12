import { useId, useState } from 'react';

import { pedirEnlaceDeDescarga, tamanoLegible } from '../adjuntos/adjuntos';
import { ErrorDeApi, pedir } from '../api/cliente';
import type { Adjunto, DetalleKudo } from '../api/tipos';

interface Props {
  readonly kudoId: string;
  readonly total: number;
}

/**
 * Los adjuntos de un Kudo, bajo demanda.
 *
 * **No se cargan con el muro.** El muro es la pantalla más visitada y su tarjeta solo trae cuántos
 * adjuntos hay; la lista con nombres y tamaños cuesta otra consulta por Kudo, y pedirla para los
 * veinte de la página sería pagar veinte consultas para que alguien mire dos. Se pide al abrir.
 *
 * Cada descarga pide un enlace nuevo en lugar de guardar uno: la URL vence en cinco minutos a
 * propósito (QA-SEG-02), y cada petición queda auditada.
 */
export function AdjuntosDeKudo({ kudoId, total }: Props) {
  const idPanel = useId();

  const [abierto, setAbierto] = useState(false);
  const [adjuntos, setAdjuntos] = useState<readonly Adjunto[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function alternar() {
    const quedaAbierto = !abierto;
    setAbierto(quedaAbierto);

    // Solo se consulta la primera vez que se abre.
    if (!quedaAbierto || adjuntos !== null || cargando) {
      return;
    }

    setCargando(true);
    setError(null);

    try {
      const detalle = await pedir<DetalleKudo>(`/kudos/${kudoId}`);
      setAdjuntos(detalle.adjuntos);
    } catch (causa) {
      setError(causa instanceof ErrorDeApi ? causa.message : 'No se pudieron cargar los adjuntos.');
    } finally {
      setCargando(false);
    }
  }

  async function abrir(adjunto: Adjunto) {
    setError(null);

    // **La ventana se abre ANTES de pedir el enlace, y por eso.** Los navegadores solo permiten
    // abrir una pestaña como respuesta directa a un toque; si se abre después de esperar a la red,
    // Safari en el celular la bloquea como emergente, y en este producto el celular es el 90 % de
    // los usuarios. Se abre en blanco ahora y se dirige al archivo cuando llega el enlace.
    const ventana = window.open('', '_blank');

    try {
      const url = await pedirEnlaceDeDescarga(kudoId, adjunto.id);

      if (ventana === null) {
        // El navegador no dejó abrirla. Se navega en la misma pestaña antes que dejar a la
        // persona sin el archivo.
        window.location.assign(url);
        return;
      }

      // Se corta la relación con esta página antes de cargar el archivo: lo que abra el
      // almacenamiento no debe poder tocar la aplicación a través de `window.opener`.
      ventana.opener = null;
      ventana.location.href = url;
    } catch (causa) {
      ventana?.close();
      setError(causa instanceof ErrorDeApi ? causa.message : 'No se pudo abrir el adjunto.');
    }
  }

  return (
    <div className="adjuntos">
      <button
        type="button"
        className="enlace"
        aria-expanded={abierto}
        aria-controls={idPanel}
        onClick={() => {
          void alternar();
        }}
      >
        {abierto ? 'Ocultar' : 'Ver'} {total} {total === 1 ? 'adjunto' : 'adjuntos'}
      </button>

      <div id={idPanel} hidden={!abierto} aria-live="polite">
        {cargando && <p role="status">Cargando…</p>}

        {error !== null && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {adjuntos !== null && (
          <ul className="lista-adjuntos">
            {adjuntos.map((adjunto) => (
              <li key={adjunto.id}>
                <button
                  type="button"
                  className="enlace"
                  onClick={() => {
                    void abrir(adjunto);
                  }}
                >
                  {adjunto.nombreOriginal}
                </button>{' '}
                <span className="meta">({tamanoLegible(adjunto.tamanoBytes)})</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
