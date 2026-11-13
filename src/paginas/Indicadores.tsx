import { useEffect, useState } from 'react';

import { ErrorDeApi, pedir } from '../api/cliente';
import type { Conteo, Indicadores as DatosIndicadores } from '../api/tipos';

/**
 * Indicadores de gestión: cuántos reconocimientos hay, de qué categorías, cuándo, y quiénes
 * reconocen y son reconocidos.
 *
 * Cada quien ve **su ámbito** —la universidad, su facultad o su programa— y la pantalla lo dice
 * arriba, porque una cifra sin su alcance se interpreta mal. Los docentes y los estudiantes reciben
 * el motivo exacto del rechazo en lugar de la pantalla: la regla la aplica la API.
 *
 * Las barras son decorativas y van marcadas como tales: la cifra siempre está escrita al lado, así
 * que no se pierde nada con un lector de pantalla ni con los colores desactivados.
 */
export function Indicadores() {
  const [datos, setDatos] = useState<DatosIndicadores | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    pedir<DatosIndicadores>('/indicadores')
      .then((d) => {
        if (!cancelado) {
          setDatos(d);
        }
      })
      .catch((causa: unknown) => {
        if (!cancelado) {
          setError(
            causa instanceof ErrorDeApi ? causa.message : 'No se pudieron cargar los indicadores.',
          );
        }
      });

    return () => {
      cancelado = true;
    };
  }, []);

  if (error !== null) {
    return (
      <>
        <h1>Indicadores</h1>
        <p className="error" role="alert">
          {error}
        </p>
      </>
    );
  }

  if (datos === null) {
    return (
      <>
        <h1>Indicadores</h1>
        <p role="status">Cargando…</p>
      </>
    );
  }

  return (
    <>
      <h1>Indicadores</h1>
      <p className="subtitulo">
        Alcance: <strong>{datos.alcance}</strong>. Lo vetado no cuenta.
      </p>

      <ul className="cifras" aria-label="Resumen">
        <Cifra titulo="Reconocimientos" valor={String(datos.kudosPublicados)} />
        <Cifra titulo="Personas activas" valor={String(datos.personasActivas)} />
        <Cifra
          titulo="Calificación promedio"
          valor={
            datos.calificacionPromedio === null
              ? '—'
              : `${datos.calificacionPromedio.toFixed(2)} de 5`
          }
          detalle={`${String(datos.totalCalificaciones)} calificaciones`}
        />
        {datos.reportesPendientes !== null && (
          <Cifra titulo="Reportes pendientes" valor={String(datos.reportesPendientes)} />
        )}
      </ul>

      <Barras
        titulo="Reconocimientos por mes"
        filas={datos.porMes}
        vacio="Todavía no hay reconocimientos."
      />
      <Barras
        titulo="Por categoría"
        filas={datos.porCategoria}
        vacio="Todavía no hay reconocimientos."
      />
      <Ranking titulo="Quiénes más reciben" filas={datos.masReconocidos} />
      <Ranking titulo="Quiénes más reconocen" filas={datos.masReconocen} />
    </>
  );
}

function Cifra({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <li className="cifra">
      <span className="cifra__titulo">{titulo}</span>
      <span className="cifra__valor">{valor}</span>
      {detalle !== undefined && <span className="meta">{detalle}</span>}
    </li>
  );
}

function Barras({
  titulo,
  filas,
  vacio,
}: {
  titulo: string;
  filas: readonly Conteo[];
  vacio: string;
}) {
  const maximo = Math.max(1, ...filas.map((f) => f.total));
  const hayAlgo = filas.some((f) => f.total > 0);

  return (
    <section className="indicador" aria-label={titulo}>
      <h2>{titulo}</h2>

      {!hayAlgo ? (
        <p>{vacio}</p>
      ) : (
        <ul className="barras">
          {filas.map((f) => (
            <li key={f.etiqueta}>
              <span className="barras__etiqueta">{f.etiqueta}</span>
              <span className="barras__pista" aria-hidden="true">
                <span
                  className="barras__relleno"
                  style={{ width: `${String((f.total / maximo) * 100)}%` }}
                />
              </span>
              <span className="barras__total">{f.total}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Ranking({ titulo, filas }: { titulo: string; filas: readonly Conteo[] }) {
  return (
    <section className="indicador" aria-label={titulo}>
      <h2>{titulo}</h2>

      {filas.length === 0 ? (
        <p>Todavía no hay reconocimientos.</p>
      ) : (
        <ol className="ranking">
          {filas.map((f) => (
            <li key={f.etiqueta}>
              <span>{f.etiqueta}</span> <strong>{f.total}</strong>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
