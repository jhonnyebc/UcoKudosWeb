import { useId, useState } from 'react';

import { descargarAdjunto, tamanoLegible } from '../adjuntos/adjuntos';
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
 * Cada apertura descarga el archivo con la sesión de quien mira, y queda auditada.
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

    // **La ventana se abre ANTES de descargar, y por eso.** Los navegadores solo permiten abrir una
    // pestaña como respuesta directa a un toque; si se abre después de esperar a la red, Safari en
    // el celular la bloquea como emergente, y en este producto el celular es el 90 % de los
    // usuarios. Se abre en blanco ahora y se dirige al archivo cuando llega.
    const ventana = window.open('', '_blank');

    try {
      // El archivo se pide con la sesión (una navegación directa no puede llevar el token) y se
      // enseña desde una URL local del navegador, que solo existe en esta sesión.
      const archivo = await descargarAdjunto(kudoId, adjunto.id);
      const url = URL.createObjectURL(archivo);

      // Se libera pasado un rato: la pestaña ya cargó el contenido.
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 60_000);

      if (ventana === null) {
        // El navegador no dejó abrirla. Se navega en la misma pestaña antes que dejar a la
        // persona sin el archivo.
        window.location.assign(url);
        return;
      }

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
