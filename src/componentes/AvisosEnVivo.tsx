import { useCallback, useState } from 'react';

import { useAvisosEnVivo, type AvisoEnVivo } from '../avisos/useAvisosEnVivo';
import { useSesion } from '../autenticacion/useSesion';

interface AvisoMostrado extends AvisoEnVivo {
  readonly id: number;
}

/**
 * Los avisos que llegan mientras la aplicación está abierta.
 *
 * Aparecen como una tarjeta flotante y se van solos a los ocho segundos. Ocho porque menos no da
 * tiempo a leer dos líneas y más estorba: esto se superpone al contenido en una pantalla de
 * celular, donde el espacio es el recurso escaso.
 *
 * **El anuncio para lectores de pantalla es `polite`, no `assertive`.** Un reconocimiento es una
 * buena noticia, no una urgencia: interrumpir a alguien a mitad de una frase para contárselo sería
 * tratar la notificación como más importante que lo que esa persona estaba haciendo.
 */
export function AvisosEnVivo() {
  const { estaDentro } = useSesion();
  const [avisos, setAvisos] = useState<readonly AvisoMostrado[]>([]);

  const alLlegar = useCallback((aviso: AvisoEnVivo) => {
    const id = Date.now() + Math.random();

    setAvisos((previos) => [...previos, { ...aviso, id }]);

    setTimeout(() => {
      setAvisos((previos) => previos.filter((a) => a.id !== id));
    }, 8_000);
  }, []);

  useAvisosEnVivo(estaDentro, alLlegar);

  if (avisos.length === 0) {
    return null;
  }

  return (
    <div className="avisos-en-vivo" role="status" aria-live="polite">
      {avisos.map((aviso) => (
        <article key={aviso.id} className="tarjeta aviso-flotante">
          <h2>{aviso.titulo}</h2>
          <p>{aviso.cuerpo}</p>
          <button
            type="button"
            className="secundario"
            onClick={() => setAvisos((previos) => previos.filter((a) => a.id !== aviso.id))}
          >
            Cerrar
          </button>
        </article>
      ))}
    </div>
  );
}
