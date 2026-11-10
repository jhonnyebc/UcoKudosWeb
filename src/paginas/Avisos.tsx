import { useEffect, useState } from 'react';

import { ErrorDeApi, pedir } from '../api/cliente';

/**
 * Los avisos que la persona ha recibido (RF-16).
 *
 * Solo se llega aquí con la sesión iniciada, porque los avisos son de alguien concreto. Quien
 * decide qué avisos son tuyos es la API a partir del token; el cliente no manda identificador
 * ninguno, que sería pedirle al usuario que diga quién es.
 */
interface Aviso {
  readonly id: string;
  readonly titulo: string;
  readonly cuerpo: string;
  readonly creadoEn: string;
  readonly leido: boolean;
}

export function Avisos() {
  const [avisos, setAvisos] = useState<readonly Aviso[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const control = new AbortController();

    pedir<Aviso[]>('/avisos', { senal: control.signal })
      .then((lista) => setAvisos(lista))
      .catch((causa: unknown) => {
        if (causa instanceof DOMException && causa.name === 'AbortError') {
          return;
        }
        setError(causa instanceof ErrorDeApi ? causa.message : 'No se pudieron cargar los avisos.');
      });

    return () => control.abort();
  }, []);

  if (error !== null) {
    return (
      <>
        <h1>Avisos</h1>
        <p className="error" role="alert">
          {error}
        </p>
      </>
    );
  }

  if (avisos === null) {
    return (
      <>
        <h1>Avisos</h1>
        <p role="status">Cargando tus avisos…</p>
      </>
    );
  }

  if (avisos.length === 0) {
    return (
      <>
        <h1>Avisos</h1>
        <p>No tienes avisos todavía.</p>
      </>
    );
  }

  return (
    <>
      <h1>Avisos</h1>
      <ul className="lista-avisos" aria-label="Tus avisos">
        {avisos.map((aviso) => (
          <li key={aviso.id}>
            <article className="tarjeta">
              <h2>{aviso.titulo}</h2>
              <p>{aviso.cuerpo}</p>
              <p className="meta">
                <time dateTime={aviso.creadoEn}>
                  {new Date(aviso.creadoEn).toLocaleString('es-CO')}
                </time>
                {!aviso.leido && <span className="solo-lectores"> · sin leer</span>}
              </p>
            </article>
          </li>
        ))}
      </ul>
    </>
  );
}
