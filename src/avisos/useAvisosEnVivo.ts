import { useEffect, useRef, useState } from 'react';

import { tokenVigente } from '../autenticacion/almacenDeSesion';

/**
 * Avisos en vivo por SSE (RF-16, ADR-0009).
 *
 * **Por qué esto no usa `EventSource`, que sería lo obvio.** `EventSource` no deja poner
 * cabeceras, así que no puede enviar el token. La salida fácil sería mandarlo en la URL, y eso es
 * justo lo que no se debe hacer: las URL acaban en el historial del navegador, en los registros
 * del servidor y en los de cualquier proxy del camino. Un token en un registro es un token
 * filtrado.
 *
 * Así que el flujo se lee con `fetch`, que sí admite la cabecera de autorización, y se parte a
 * mano por líneas. Es más código, pero es el código correcto.
 *
 * La reconexión es con espera creciente. En una red móvil la conexión se cae constantemente, y
 * reintentar de inmediato en bucle agota la batería y machaca al servidor justo cuando peor está.
 */
export interface AvisoEnVivo {
  readonly titulo: string;
  readonly cuerpo: string;
  readonly url: string | null;
}

const ESPERA_INICIAL_MS = 1_000;
const ESPERA_MAXIMA_MS = 30_000;

export function useAvisosEnVivo(activo: boolean, alLlegar: (aviso: AvisoEnVivo) => void) {
  const [conectado, setConectado] = useState(false);

  // La función de aviso se guarda en una referencia para que cambiarla no reinicie la conexión:
  // si dependiera de ella, cada dibujado abriría un flujo nuevo.
  const manejador = useRef(alLlegar);
  manejador.current = alLlegar;

  useEffect(() => {
    if (!activo) {
      return;
    }

    const control = new AbortController();
    let espera = ESPERA_INICIAL_MS;
    let vivo = true;

    async function escuchar() {
      while (vivo) {
        try {
          const token = tokenVigente();
          if (token === null) {
            // Sin sesión no hay nada que escuchar. Se espera por si vuelve, en lugar de abandonar.
            await descansar(ESPERA_INICIAL_MS, control.signal);
            continue;
          }

          const respuesta = await fetch('/api/avisos/en-vivo', {
            headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
            signal: control.signal,
          });

          if (!respuesta.ok || respuesta.body === null) {
            throw new Error('No se pudo abrir el canal de avisos.');
          }

          setConectado(true);
          espera = ESPERA_INICIAL_MS;

          await leerFlujo(respuesta.body, (dato) => {
            const aviso = interpretar(dato);
            if (aviso !== null) {
              manejador.current(aviso);
            }
          });
        } catch (causa) {
          if (causa instanceof DOMException && causa.name === 'AbortError') {
            return;
          }
          // Cualquier otro fallo se trata igual: se reintenta. No hay nada que decirle al usuario
          // por una conexión caída; lo que importa es que vuelva sola.
        } finally {
          setConectado(false);
        }

        if (!vivo) {
          return;
        }

        await descansar(espera, control.signal);
        espera = Math.min(espera * 2, ESPERA_MAXIMA_MS);
      }
    }

    void escuchar();

    return () => {
      vivo = false;
      control.abort();
    };
  }, [activo]);

  return { conectado };
}

/**
 * Lee el flujo y entrega el contenido de cada evento.
 *
 * El protocolo de SSE separa los eventos con una línea en blanco, y las líneas que empiezan por
 * dos puntos son comentarios: el servidor los usa de latido para que la conexión no se caiga. Se
 * ignoran, pero su llegada ya cumple su función.
 *
 * El resto se acumula en un búfer porque **un evento puede llegar partido en varios trozos**: la
 * red no respeta los límites del mensaje, y procesar cada trozo por separado produciría avisos
 * cortados.
 */
async function leerFlujo(cuerpo: ReadableStream<Uint8Array>, alRecibir: (dato: string) => void) {
  const lector = cuerpo.getReader();
  const decodificador = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await lector.read();
    if (done) {
      return;
    }

    buffer += decodificador.decode(value, { stream: true });

    let corte = buffer.indexOf('\n\n');
    while (corte !== -1) {
      const bloque = buffer.slice(0, corte);
      buffer = buffer.slice(corte + 2);

      for (const linea of bloque.split('\n')) {
        if (linea.startsWith('data: ')) {
          alRecibir(linea.slice(6));
        }
      }

      corte = buffer.indexOf('\n\n');
    }
  }
}

function interpretar(dato: string): AvisoEnVivo | null {
  try {
    const crudo = JSON.parse(dato) as Record<string, unknown>;

    const titulo = typeof crudo['titulo'] === 'string' ? crudo['titulo'] : null;
    const cuerpo = typeof crudo['cuerpo'] === 'string' ? crudo['cuerpo'] : null;

    if (titulo === null || cuerpo === null) {
      return null;
    }

    return { titulo, cuerpo, url: typeof crudo['url'] === 'string' ? crudo['url'] : null };
  } catch {
    // Un mensaje que no se entiende se descarta sin tumbar la conexión: perder un aviso es malo,
    // perder el canal entero es peor.
    return null;
  }
}

function descansar(ms: number, senal: AbortSignal): Promise<void> {
  return new Promise((resolver) => {
    const temporizador = setTimeout(resolver, ms);
    senal.addEventListener('abort', () => {
      clearTimeout(temporizador);
      resolver();
    });
  });
}
