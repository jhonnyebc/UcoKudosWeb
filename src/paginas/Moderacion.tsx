import { type FormEvent, useCallback, useEffect, useId, useState } from 'react';

import { ErrorDeApi, pedir } from '../api/cliente';
import type { ReportePendiente } from '../api/tipos';

/**
 * La bandeja de quien modera (RF-11, RF-12): los reportes que esperan decisión, con el contenido
 * reportado a la vista para decidir sin buscarlo.
 *
 * Solo la ven el Rector y el Coordinador Académico, **y la regla la aplica la API**: cualquier otro
 * rol recibe el motivo exacto del rechazo en lugar de una lista. Cada reporte se resuelve de dos
 * maneras: **vetar** (oculta el contenido y su hilo, y avisa al autor) o **descartar** (el reporte
 * no procede y el contenido sigue visible).
 */
export function Moderacion() {
  const [reportes, setReportes] = useState<readonly ReportePendiente[] | null>(null);
  const [errorDeCarga, setErrorDeCarga] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setReportes(await pedir<ReportePendiente[]>('/moderacion/reportes'));
      setErrorDeCarga(null);
    } catch (causa) {
      setReportes(null);
      setErrorDeCarga(
        causa instanceof ErrorDeApi ? causa.message : 'No se pudieron cargar los reportes.',
      );
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function resolver(accion: () => Promise<unknown>, exito: string, fallo: string) {
    setError(null);
    setAviso(null);

    try {
      await accion();
      setAviso(exito);
      await cargar();
    } catch (causa) {
      setError(causa instanceof ErrorDeApi ? causa.message : fallo);
    }
  }

  if (errorDeCarga !== null) {
    return (
      <>
        <h1>Moderación</h1>
        <p className="error" role="alert">
          {errorDeCarga}
        </p>
      </>
    );
  }

  if (reportes === null) {
    return (
      <>
        <h1>Moderación</h1>
        <p role="status">Cargando…</p>
      </>
    );
  }

  return (
    <>
      <h1>Moderación</h1>
      <p className="subtitulo">Reportes de la comunidad que esperan tu decisión.</p>

      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {aviso !== null && (
        <p className="exito" role="status">
          {aviso}
        </p>
      )}

      {reportes.length === 0 ? (
        <p>No hay reportes pendientes.</p>
      ) : (
        <ul className="lista-kudos" aria-label="Reportes pendientes">
          {reportes.map((r) => (
            <li key={r.id}>
              <TarjetaDeReporte
                reporte={r}
                alVetar={(motivo) =>
                  resolver(
                    () =>
                      pedir('/moderacion/vetos', {
                        metodo: 'POST',
                        cuerpo: {
                          tipoContenido: r.tipoContenido,
                          contenidoId: r.contenidoId,
                          motivo,
                        },
                      }),
                    'El contenido quedó vetado y su autor fue avisado.',
                    'No se pudo vetar el contenido.',
                  )
                }
                alDescartar={() =>
                  resolver(
                    () => pedir(`/moderacion/reportes/${r.id}/descartar`, { metodo: 'POST' }),
                    'Descartaste el reporte: el contenido sigue visible.',
                    'No se pudo descartar el reporte.',
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function TarjetaDeReporte({
  reporte,
  alVetar,
  alDescartar,
}: {
  reporte: ReportePendiente;
  alVetar: (motivo: string) => Promise<void>;
  alDescartar: () => Promise<void>;
}) {
  const id = useId();
  const [vetando, setVetando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function vetar(evento: FormEvent) {
    evento.preventDefault();
    setOcupado(true);
    await alVetar(motivo.trim());
    setOcupado(false);
  }

  async function descartar() {
    setOcupado(true);
    await alDescartar();
    setOcupado(false);
  }

  return (
    <article className="tarjeta tarjeta-kudo">
      <p className="categoria">{reporte.tipoContenido === 'Kudo' ? 'Kudo' : 'Respuesta'}</p>

      <blockquote className="contenido-reportado">{reporte.contenido}</blockquote>
      <p className="meta">Publicado por {reporte.autorDelContenido}</p>

      <p>
        <strong>Reportado por {reporte.reportadoPor}:</strong> {reporte.motivo}
      </p>

      {!vetando ? (
        <div className="acciones">
          <button
            type="button"
            className="peligro"
            disabled={ocupado}
            onClick={() => setVetando(true)}
          >
            Vetar…
          </button>
          <button
            type="button"
            className="secundario"
            disabled={ocupado}
            onClick={() => void descartar()}
          >
            Descartar reporte
          </button>
        </div>
      ) : (
        <form onSubmit={(e) => void vetar(e)}>
          <label htmlFor={`${id}-motivo`}>Motivo del veto</label>
          <input
            id={`${id}-motivo`}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            required
          />
          <p className="meta">
            Vetar oculta este contenido —y sus respuestas— para todos y avisa a su autor con el
            motivo.
          </p>
          <div className="acciones">
            <button type="submit" className="peligro" disabled={ocupado || motivo.trim() === ''}>
              Confirmar veto
            </button>
            <button type="button" className="secundario" onClick={() => setVetando(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
