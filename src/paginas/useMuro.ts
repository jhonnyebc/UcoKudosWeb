import { useCallback, useEffect, useRef, useState } from 'react';

import { ErrorDeApi, pedir } from '../api/cliente';
import type { KudoDelMuro, PaginaMuro } from '../api/tipos';

/**
 * El muro, página a página, con cursor (ADR-0010, ADR-0015 punto 5).
 *
 * **Por qué cursor y no número de página.** Con `?pagina=3` el servidor tiene que saltarse las
 * anteriores, así que la página 50 cuesta mucho más que la 1. Y hay algo peor: si alguien publica
 * un Kudo mientras el usuario baja, todo se desplaza una posición y el lector ve repetido el
 * último de la página anterior, o se salta uno. Con cursor, cada página continúa exactamente donde
 * terminó la anterior.
 *
 * Las cuatro situaciones que esto distingue, porque en una pantalla de celular se ven distintas y
 * no da igual confundirlas: cargando la primera vez, cargando más abajo, no hay nada todavía, y
 * algo falló.
 */
export interface EstadoMuro {
  readonly kudos: readonly KudoDelMuro[];
  readonly cargandoPrimeraVez: boolean;
  readonly cargandoMas: boolean;
  readonly hayMas: boolean;
  readonly error: string | null;
  readonly cargarMas: () => void;
  readonly reintentar: () => void;
}

export function useMuro(tamanoPagina = 20): EstadoMuro {
  const [kudos, setKudos] = useState<readonly KudoDelMuro[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hayMas, setHayMas] = useState(true);
  const [cargando, setCargando] = useState(true);
  const [yaCargoUnaVez, setYaCargoUnaVez] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * La petición viva en este momento.
   *
   * Es una sola referencia, y hace de guarda y de cancelador a la vez. La primera versión usaba
   * además un booleano de «hay una petición en curso» y **tenía un fallo serio**: al montar dos
   * veces —cosa que React hace a propósito en desarrollo para destapar justo esta clase de
   * errores— la primera petición se cancelaba al desmontar y la segunda se descartaba porque el
   * booleano seguía puesto, ya que solo se limpiaba de forma asíncrona.
   *
   * El resultado era el peor posible: ni datos, ni indicador de carga, ni mensaje de error. El
   * muro decía «todavía no hay reconocimientos» sin haber llegado a preguntar. Un fallo que se
   * disfraza de estado normal no se detecta leyendo el código; se detectó abriendo la pantalla y
   * mirando qué peticiones salieron de verdad.
   */
  const peticionViva = useRef<AbortController | null>(null);

  const traer = useCallback(
    async (desde: string | null, { superponer }: { superponer: boolean }) => {
      // Una carga que pide el usuario no debe atropellar a la que ya está en marcha: produciría
      // páginas duplicadas. Una recarga desde el principio sí la sustituye.
      if (peticionViva.current !== null && !superponer) {
        return;
      }

      peticionViva.current?.abort();

      const control = new AbortController();
      peticionViva.current = control;

      setCargando(true);
      setError(null);

      try {
        const parametros = new URLSearchParams({ tamano: String(tamanoPagina) });
        if (desde !== null) {
          parametros.set('cursor', desde);
        }

        const pagina = await pedir<PaginaMuro>(`/kudos?${parametros.toString()}`, {
          senal: control.signal,
        });

        setKudos((previos) =>
          desde === null ? pagina.elementos : [...previos, ...pagina.elementos],
        );
        setCursor(pagina.cursorSiguiente);
        setHayMas(pagina.cursorSiguiente !== null);
        setYaCargoUnaVez(true);
      } catch (causa) {
        // Abortar no es fallar: pasa cuando el usuario cambia de pantalla o cuando otra petición
        // sustituye a esta. Mostrarle un error sería mentirle.
        if (causa instanceof DOMException && causa.name === 'AbortError') {
          return;
        }

        setError(causa instanceof ErrorDeApi ? causa.message : 'No se pudo cargar el muro.');
      } finally {
        // Solo si esta sigue siendo la petición vigente. Sin esta comprobación, una petición
        // cancelada apagaría el indicador de carga de la que la sustituyó.
        if (peticionViva.current === control) {
          peticionViva.current = null;
          setCargando(false);
        }
      }
    },
    [tamanoPagina],
  );

  useEffect(() => {
    void traer(null, { superponer: true });

    return () => {
      peticionViva.current?.abort();
      peticionViva.current = null;
    };
  }, [traer]);

  const cargarMas = useCallback(() => {
    if (hayMas) {
      void traer(cursor, { superponer: false });
    }
  }, [cursor, hayMas, traer]);

  const reintentar = useCallback(() => {
    void traer(cursor, { superponer: true });
  }, [cursor, traer]);

  return {
    kudos,
    cargandoPrimeraVez: cargando && !yaCargoUnaVez,
    cargandoMas: cargando && yaCargoUnaVez,
    hayMas,
    error,
    cargarMas,
    reintentar,
  };
}
