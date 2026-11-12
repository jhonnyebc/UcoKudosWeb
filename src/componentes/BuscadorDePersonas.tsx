import { useEffect, useId, useRef, useState } from 'react';

import { pedir } from '../api/cliente';
import type { PersonaBuscada } from '../api/tipos';

/** Mínimo de caracteres antes de consultar. Tiene que coincidir con el de la API. */
const MINIMO = 2;

/**
 * Espera tras la última pulsación antes de consultar.
 *
 * Sin esto, escribir «Benítez» serían siete peticiones y las respuestas podrían llegar
 * desordenadas, dejando en pantalla los resultados de «Ben» después de los de «Benítez».
 */
const ESPERA_MS = 250;

interface Props {
  readonly id: string;
  readonly valor: PersonaBuscada | null;
  readonly alElegir: (persona: PersonaBuscada | null) => void;
}

/**
 * Buscador de la persona a reconocer.
 *
 * Sustituye a la caja donde había que **pegar un identificador**. Esa versión funcionaba y era
 * inusable: nadie conoce de memoria un UUID, así que la funcionalidad obligatoria del enunciado
 * quedaba fuera del alcance de un usuario real.
 *
 * Está construido como un *combobox* siguiendo el patrón de accesibilidad de ARIA, y no como una
 * lista cualquiera bajo un campo de texto, porque quien usa lector de pantalla necesita saber que
 * hay sugerencias, cuántas y cuál está señalada. `aria-activedescendant` permite mover la
 * selección con las flechas **sin** que el foco salga del campo, que es lo que hace que se pueda
 * seguir escribiendo.
 */
export function BuscadorDePersonas({ id, valor, alElegir }: Props) {
  const [texto, setTexto] = useState('');
  const [opciones, setOpciones] = useState<readonly PersonaBuscada[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [señalada, setSeñalada] = useState(-1);
  const [buscando, setBuscando] = useState(false);

  const idLista = useId();
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Con una persona ya elegida no se consulta: el texto del campo es su nombre, y buscarlo otra
    // vez solo serviría para reabrir la lista encima de una elección hecha.
    if (valor !== null || texto.trim().length < MINIMO) {
      setOpciones([]);
      setBuscando(false);
      return;
    }

    const control = new AbortController();
    setBuscando(true);

    const temporizador = setTimeout(() => {
      pedir<PersonaBuscada[]>(`/identidad/personas?busqueda=${encodeURIComponent(texto.trim())}`, {
        senal: control.signal,
      })
        .then((lista) => {
          setOpciones(lista);
          setAbierto(true);
          setSeñalada(-1);
        })
        .catch(() => {
          // Un fallo de búsqueda no merece un cartel de error: el formulario sigue siendo usable
          // y el usuario puede volver a escribir. Lo que no puede quedar es la lista anterior,
          // que estaría mostrando resultados de otro texto.
          setOpciones([]);
        })
        .finally(() => setBuscando(false));
    }, ESPERA_MS);

    return () => {
      clearTimeout(temporizador);
      control.abort();
    };
  }, [texto, valor]);

  // Cerrar al tocar fuera. En un celular es el gesto natural para descartar la lista, y sin esto
  // se queda abierta tapando el resto del formulario.
  useEffect(() => {
    function alTocarFuera(evento: MouseEvent) {
      if (contenedor.current && !contenedor.current.contains(evento.target as Node)) {
        setAbierto(false);
      }
    }

    document.addEventListener('mousedown', alTocarFuera);
    return () => document.removeEventListener('mousedown', alTocarFuera);
  }, []);

  function elegir(persona: PersonaBuscada) {
    alElegir(persona);
    setTexto(persona.nombreCompleto);
    setAbierto(false);
    setOpciones([]);
    setSeñalada(-1);
  }

  function alEscribir(nuevo: string) {
    setTexto(nuevo);

    // Cambiar el texto deshace la elección. Si no, quedaría enviada una persona que ya no es la
    // que se lee en el campo, que es la peor clase de error: silencioso y plausible.
    if (valor !== null) {
      alElegir(null);
    }
  }

  function alPulsarTecla(evento: React.KeyboardEvent<HTMLInputElement>) {
    if (evento.key === 'Escape') {
      setAbierto(false);
      return;
    }

    if (opciones.length === 0) {
      return;
    }

    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      setAbierto(true);
      setSeñalada((actual) => (actual + 1) % opciones.length);
      return;
    }

    if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      setSeñalada((actual) => (actual <= 0 ? opciones.length - 1 : actual - 1));
      return;
    }

    if (evento.key === 'Enter' && señalada >= 0) {
      // Solo se traga el Enter cuando hay algo señalado; si no, debe seguir enviando el
      // formulario como en cualquier otro campo.
      evento.preventDefault();
      const elegida = opciones[señalada];
      if (elegida !== undefined) {
        elegir(elegida);
      }
    }
  }

  const hayLista = abierto && opciones.length > 0;

  return (
    <div ref={contenedor} className="buscador">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={hayLista}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={señalada >= 0 ? `${idLista}-${señalada}` : undefined}
        value={texto}
        onChange={(e) => alEscribir(e.target.value)}
        onKeyDown={alPulsarTecla}
        onFocus={() => opciones.length > 0 && setAbierto(true)}
        autoComplete="off"
        placeholder="Escribe un nombre"
      />

      {/* El estado se anuncia en una región viva porque un lector de pantalla no ve aparecer la
          lista. "polite" para que no corte lo que esté leyendo. */}
      <span aria-live="polite" className="buscador-estado">
        {buscando && 'Buscando…'}
        {!buscando && abierto && opciones.length === 0 && texto.trim().length >= MINIMO && (
          <>No hay nadie con ese nombre.</>
        )}
        {!buscando && hayLista && `${opciones.length} personas encontradas.`}
      </span>

      <ul id={idLista} role="listbox" aria-label="Personas encontradas" hidden={!hayLista}>
        {opciones.map((persona, indice) => (
          <li
            key={persona.id}
            id={`${idLista}-${indice}`}
            role="option"
            aria-selected={indice === señalada}
            // onMouseDown y no onClick: el click llega después de que el campo pierda el foco, y
            // para entonces el manejador de «tocar fuera» ya habría cerrado la lista.
            onMouseDown={(evento) => {
              evento.preventDefault();
              elegir(persona);
            }}
          >
            {persona.nombreCompleto}
          </li>
        ))}
      </ul>
    </div>
  );
}
