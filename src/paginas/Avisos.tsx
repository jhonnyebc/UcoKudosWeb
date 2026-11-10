import { useCallback, useEffect, useState } from 'react';

import { ErrorDeApi, pedir } from '../api/cliente';
import type { Aviso, PaginaAvisos } from '../api/tipos';

/**
 * Los avisos que la persona ha recibido (RF-16).
 *
 * Esta pantalla es la que hace cierta la promesa del sistema de notificaciones: el canal en vivo
 * solo funciona con la aplicación abierta y la notificación del navegador puede no llegar nunca,
 * así que lo que no se entregó en el momento se ve aquí.
 *
 * El cliente no manda ningún identificador: quién pregunta lo dice el token. Pedir los avisos «de
 * una persona» desde la URL sería dejar que cualquiera lea los de otro cambiando un número.
 */
export function Avisos() {
  const [pagina, setPagina] = useState<PaginaAvisos | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback((senal?: AbortSignal) => {
    setError(null);

    pedir<PaginaAvisos>('/avisos', senal ? { senal } : {})
      .then((datos) => setPagina(datos))
      .catch((causa: unknown) => {
        if (causa instanceof DOMException && causa.name === 'AbortError') {
          return;
        }
        setError(causa instanceof ErrorDeApi ? causa.message : 'No se pudieron cargar los avisos.');
      });
  }, []);

  useEffect(() => {
    const control = new AbortController();
    cargar(control.signal);
    return () => control.abort();
  }, [cargar]);

  /**
   * Marca como leído **en la pantalla primero** y después avisa al servidor.
   *
   * Esperar la respuesta para tachar un aviso haría que en una red móvil lenta el usuario tocara
   * dos veces creyendo que no funcionó. Si el servidor falla, se recarga la lista y el aviso vuelve
   * a aparecer sin leer: se prefiere un retroceso visible a un estado falso.
   */
  async function marcarLeido(aviso: Aviso) {
    if (aviso.leido || pagina === null) {
      return;
    }

    setPagina({
      elementos: pagina.elementos.map((a) => (a.id === aviso.id ? { ...a, leido: true } : a)),
      sinLeer: Math.max(0, pagina.sinLeer - 1),
    });

    try {
      await pedir<void>(`/avisos/${aviso.id}/leido`, { metodo: 'POST' });
    } catch {
      cargar();
    }
  }

  if (error !== null) {
    return (
      <>
        <h1>Avisos</h1>
        <p className="error" role="alert">
          {error}
        </p>
        <button type="button" onClick={() => cargar()}>
          Reintentar
        </button>
      </>
    );
  }

  if (pagina === null) {
    return (
      <>
        <h1>Avisos</h1>
        <p role="status">Cargando tus avisos…</p>
      </>
    );
  }

  if (pagina.elementos.length === 0) {
    return (
      <>
        <h1>Avisos</h1>
        <p>No tienes avisos todavía.</p>
      </>
    );
  }

  return (
    <>
      <h1>
        Avisos{' '}
        {pagina.sinLeer > 0 && (
          <span className="contador-sin-leer">
            {pagina.sinLeer}
            <span className="solo-lectores"> sin leer</span>
          </span>
        )}
      </h1>

      <ul className="lista-avisos" aria-label="Tus avisos">
        {pagina.elementos.map((aviso) => (
          <li key={aviso.id}>
            <article className={aviso.leido ? 'tarjeta' : 'tarjeta tarjeta--sin-leer'}>
              <h2>{aviso.titulo}</h2>
              <p>{aviso.cuerpo}</p>

              <p className="meta">
                <time dateTime={aviso.generadoEn}>
                  {new Date(aviso.generadoEn).toLocaleString('es-CO')}
                </time>
              </p>

              {!aviso.leido && (
                <button
                  type="button"
                  className="secundario"
                  onClick={() => void marcarLeido(aviso)}
                >
                  Marcar como leído
                </button>
              )}
            </article>
          </li>
        ))}
      </ul>
    </>
  );
}
