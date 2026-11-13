import { useState } from 'react';

import { ErrorDeApi, pedir } from '../api/cliente';
import type { DetalleKudo } from '../api/tipos';

interface Props {
  readonly kudoId: string;
  readonly promedio: number | null;
  readonly total: number;
}

const ESTRELLAS = [1, 2, 3, 4, 5] as const;

/**
 * Calificar un Kudo de 1 a 5 estrellas (RF-10).
 *
 * Es un grupo de botones y no un campo de formulario: se pulsa una estrella y se envía. Cada una
 * lleva su nombre completo («Calificar con 4 estrellas») para que un lector de pantalla no anuncie
 * cinco botones idénticos, y `aria-pressed` marca la que eligió quien mira.
 *
 * **Se puede cambiar de opinión**, y la API lo trata como reemplazo: el total no sube y el promedio
 * no cuenta dos veces a la misma persona. Tras calificar se vuelve a pedir el Kudo para enseñar el
 * promedio que calculó el servidor, en lugar de calcularlo aquí y arriesgarse a que no coincida.
 */
export function Calificador({ kudoId, promedio, total }: Props) {
  const [resumen, setResumen] = useState({ promedio, total });
  const [mia, setMia] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function calificar(estrellas: number) {
    setError(null);
    setEnviando(true);

    try {
      await pedir('/interaccion/calificaciones', {
        metodo: 'POST',
        cuerpo: { tipoContenido: 'Kudo', contenidoId: kudoId, estrellas },
      });
      setMia(estrellas);

      const detalle = await pedir<DetalleKudo>(`/kudos/${kudoId}`);
      setResumen({
        promedio: detalle.kudo.promedioCalificacion,
        total: detalle.kudo.totalCalificaciones,
      });
    } catch (causa) {
      setError(causa instanceof ErrorDeApi ? causa.message : 'No se pudo enviar tu calificación.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="calificador">
      <div className="calificador__estrellas" role="group" aria-label="Tu calificación">
        {ESTRELLAS.map((n) => (
          <button
            key={n}
            type="button"
            className={mia !== null && n <= mia ? 'estrella estrella--activa' : 'estrella'}
            aria-pressed={mia === n}
            aria-label={`Calificar con ${String(n)} ${n === 1 ? 'estrella' : 'estrellas'}`}
            disabled={enviando}
            onClick={() => {
              void calificar(n);
            }}
          >
            <span aria-hidden="true">{mia !== null && n <= mia ? '★' : '☆'}</span>
          </button>
        ))}
      </div>

      <span className="meta">
        {resumen.total > 0 && resumen.promedio !== null ? (
          <>
            {resumen.promedio.toFixed(1)} de 5
            <span className="solo-lectores"> según {resumen.total} calificaciones</span>
            <span aria-hidden="true">
              {' · '}
              {resumen.total} {resumen.total === 1 ? 'calificación' : 'calificaciones'}
            </span>
          </>
        ) : (
          'Sin calificaciones todavía'
        )}
      </span>

      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
