import { useEffect, useRef } from 'react';

import { TarjetaDeKudo } from '../componentes/TarjetaDeKudo';
import { useMuro } from './useMuro';

/**
 * El muro: la primera pantalla y la que más se mira (RF-13, DRV-002).
 *
 * El desplazamiento infinito se dispara con un observador de intersección sobre un centinela al
 * final de la lista, no escuchando el evento de scroll. La diferencia importa en un celular: el
 * evento de scroll se dispara decenas de veces por segundo y obliga a calcular posiciones en cada
 * una, lo que se nota en la batería y en la fluidez.
 *
 * Hay además un botón de «cargar más» junto al centinela, y no es redundante: con teclado o lector
 * de pantalla no se «baja hasta el final», así que sin él la segunda página sería inalcanzable.
 */
export function Muro() {
  const { kudos, cargandoPrimeraVez, cargandoMas, hayMas, error, cargarMas, reintentar } =
    useMuro();
  const centinela = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const nodo = centinela.current;
    if (nodo === null || !hayMas) {
      return;
    }

    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas[0]?.isIntersecting === true) {
          cargarMas();
        }
      },
      // Empieza a cargar antes de llegar al final: así el contenido suele estar listo cuando el
      // usuario llega, en vez de hacerle esperar mirando un indicador.
      { rootMargin: '400px' },
    );

    observador.observe(nodo);
    return () => observador.disconnect();
  }, [cargarMas, hayMas]);

  if (cargandoPrimeraVez) {
    return (
      <>
        <h1>Muro</h1>
        <p role="status">Cargando el muro…</p>
      </>
    );
  }

  if (error !== null && kudos.length === 0) {
    return (
      <>
        <h1>Muro</h1>
        <p className="error" role="alert">
          {error}
        </p>
        <button type="button" onClick={reintentar}>
          Reintentar
        </button>
      </>
    );
  }

  if (kudos.length === 0) {
    return (
      <>
        <h1>Muro</h1>
        <p>Todavía no hay reconocimientos. Puedes ser quien publique el primero.</p>
      </>
    );
  }

  return (
    <>
      <h1>Muro</h1>

      {/* feed + aria-busy: el lector de pantalla anuncia lo que se añade al final sin interrumpir
          la lectura de lo que ya estaba. */}
      <ul className="lista-kudos" aria-label="Reconocimientos publicados" aria-busy={cargandoMas}>
        {kudos.map((kudo) => (
          <li key={kudo.id}>
            <TarjetaDeKudo kudo={kudo} />
          </li>
        ))}
      </ul>

      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div ref={centinela} />

      {hayMas && (
        <button type="button" onClick={cargarMas} disabled={cargandoMas}>
          {cargandoMas ? 'Cargando…' : 'Cargar más'}
        </button>
      )}

      {!hayMas && <p>Eso es todo por ahora.</p>}
    </>
  );
}
