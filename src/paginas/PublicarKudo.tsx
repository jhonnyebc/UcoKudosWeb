import { useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ErrorDeApi, pedir } from '../api/cliente';
import type { Categoria, KudoPublicado, PersonaBuscada } from '../api/tipos';
import { BuscadorDePersonas } from '../componentes/BuscadorDePersonas';

/**
 * Publicar un Kudo (RF-07): la funcionalidad obligatoria del enunciado.
 *
 * Dos cosas que conviene decir de este formulario:
 *
 * **La validación de aquí es comodidad, no seguridad.** Evita un viaje a la red para decir algo
 * que se sabe de antemano, pero la regla de verdad la aplica la API: cualquiera puede saltarse
 * este formulario (ADR-0015, punto 8).
 *
 * **El botón se bloquea mientras se envía.** Sin eso, un doble toque —que en una pantalla táctil
 * pasa constantemente— publicaría dos Kudos, y cada uno dispararía sus tres notificaciones.
 */
export function PublicarKudo() {
  const navegar = useNavigate();
  const idCategoria = useId();
  const idDestinatario = useId();
  const idContenido = useId();

  const [categorias, setCategorias] = useState<readonly Categoria[]>([]);
  const [categoriaId, setCategoriaId] = useState('');
  const [destinatario, setDestinatario] = useState<PersonaBuscada | null>(null);
  const [contenido, setContenido] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const control = new AbortController();

    pedir<Categoria[]>('/categorias', { senal: control.signal })
      .then((lista) => setCategorias(lista))
      .catch((causa: unknown) => {
        if (causa instanceof DOMException && causa.name === 'AbortError') {
          return;
        }
        setError('No se pudieron cargar las categorías.');
      });

    return () => control.abort();
  }, []);

  const contenidoLimpio = contenido.trim();
  const puedeEnviar =
    !enviando && categoriaId !== '' && destinatario !== null && contenidoLimpio.length > 0;

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();

    if (!puedeEnviar) {
      return;
    }

    setEnviando(true);
    setError(null);

    try {
      const publicado = await pedir<KudoPublicado>('/kudos', {
        metodo: 'POST',
        cuerpo: { destinatarioId: destinatario.id, categoriaId, contenido: contenidoLimpio },
      });

      navegar(`/?publicado=${publicado.id}`);
    } catch (causa) {
      setError(causa instanceof ErrorDeApi ? causa.message : 'No se pudo publicar el Kudo.');
      setEnviando(false);
    }
  }

  return (
    <>
      <h1>Publicar un reconocimiento</h1>

      {/* El `void` es deliberado: React no espera la promesa del manejador, y dejarla suelta
          escondería un error de envío sin que nadie se entere. Dentro de `enviar` todo fallo se
          captura y se muestra. */}
      <form
        onSubmit={(evento) => {
          void enviar(evento);
        }}
        noValidate
      >
        <p>
          <label htmlFor={idCategoria}>Categoría</label>
          <select
            id={idCategoria}
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
            required
          >
            <option value="">Elige una categoría</option>
            {categorias
              .filter((categoria) => categoria.activa)
              .map((categoria) => (
                <option key={categoria.id} value={categoria.id}>
                  {categoria.nombre}
                </option>
              ))}
          </select>
        </p>

        <p>
          <label htmlFor={idDestinatario}>Persona reconocida</label>
          <BuscadorDePersonas id={idDestinatario} valor={destinatario} alElegir={setDestinatario} />
        </p>

        <p>
          <label htmlFor={idContenido}>Mensaje</label>
          {/* **Sin `maxLength` y sin recortar, a propósito.** El enunciado dice que el contenido
              no tiene límite de longitud, y el dominio y la base lo respetan: la columna es
              `text`, sin tope. Una versión anterior de esta pantalla cortaba a 500 caracteres,
              así que la interfaz imponía una regla que el sistema no tiene, y lo hacía en
              silencio: el texto de más se perdía sin aviso al pegarlo. */}
          <textarea
            id={idContenido}
            value={contenido}
            onChange={(e) => setContenido(e.target.value)}
            rows={5}
            aria-describedby={`${idContenido}-cuenta`}
            required
          />
          {/* El contador informa, no limita. aria-live para que quien usa lector de pantalla lo
              sepa, pero "polite" para que no interrumpa en cada letra. */}
          <span id={`${idContenido}-cuenta`} aria-live="polite">
            {contenido.length} {contenido.length === 1 ? 'carácter' : 'caracteres'}
          </span>
        </p>

        {error !== null && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" disabled={!puedeEnviar}>
          {enviando ? 'Publicando…' : 'Publicar'}
        </button>
      </form>
    </>
  );
}
