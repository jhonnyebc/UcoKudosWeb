import { tokenVigente } from '../autenticacion/almacenDeSesion';

/**
 * El único sitio por donde el cliente habla con la API.
 *
 * Está centralizado a propósito: la cabecera de autorización, el tratamiento de errores y la
 * cancelación se definen una vez. Si cada pantalla hiciera su propio `fetch`, bastaría olvidarse
 * en una para tener una petición sin autenticar o un error que el usuario ve como pantalla en
 * blanco.
 */

/** Un fallo de la API ya traducido a algo que se le puede enseñar a una persona. */
export class ErrorDeApi extends Error {
  constructor(
    readonly estado: number,
    mensaje: string,
    readonly esDeAutenticacion: boolean = false,
  ) {
    super(mensaje);
    this.name = 'ErrorDeApi';
  }
}

const BASE = '/api';

/**
 * Mensajes en español y en términos del usuario, no del protocolo.
 *
 * «Error 500» no le dice nada a quien está intentando felicitar a un compañero. Y el 403 y el 404
 * se separan a propósito: no es lo mismo «no existe» que «no puedes verlo».
 */
function mensajeSegunEstado(estado: number): string {
  switch (estado) {
    case 400:
      return 'Hay algo mal en los datos enviados. Revisa el formulario.';
    case 401:
      return 'Tu sesión expiró. Vuelve a entrar.';
    case 403:
      return 'No tienes permiso para hacer esto.';
    case 404:
      return 'No encontramos lo que buscabas.';
    case 409:
      return 'Alguien más cambió esto mientras lo editabas. Vuelve a intentarlo.';
    case 429:
      return 'Demasiadas peticiones seguidas. Espera un momento.';
    default:
      return estado >= 500
        ? 'La plataforma tuvo un problema. Inténtalo de nuevo en un momento.'
        : 'No se pudo completar la operación.';
  }
}

interface OpcionesPeticion {
  readonly metodo?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly cuerpo?: unknown;
  readonly senal?: AbortSignal;
}

export async function pedir<T>(ruta: string, opciones: OpcionesPeticion = {}): Promise<T> {
  const { metodo = 'GET', cuerpo, senal } = opciones;

  const cabeceras: Record<string, string> = { Accept: 'application/json' };

  const token = tokenVigente();
  if (token !== null) {
    cabeceras['Authorization'] = `Bearer ${token}`;
  }

  if (cuerpo !== undefined) {
    cabeceras['Content-Type'] = 'application/json';
  }

  let respuesta: Response;

  try {
    respuesta = await fetch(`${BASE}${ruta}`, {
      method: metodo,
      headers: cabeceras,
      body: cuerpo === undefined ? null : JSON.stringify(cuerpo),
      ...(senal ? { signal: senal } : {}),
    });
  } catch (causa) {
    // Una petición abortada no es un fallo: es que el usuario cambió de pantalla. Se deja pasar
    // para que quien llamó la distinga de un problema real.
    if (causa instanceof DOMException && causa.name === 'AbortError') {
      throw causa;
    }

    // Sin red. Es el caso más frecuente en un celular y merece su propio mensaje: decir «error del
    // servidor» cuando el usuario está en un ascensor es mentirle.
    throw new ErrorDeApi(0, 'Sin conexión. Comprueba tu red e inténtalo de nuevo.');
  }

  if (!respuesta.ok) {
    throw new ErrorDeApi(
      respuesta.status,
      mensajeSegunEstado(respuesta.status),
      respuesta.status === 401,
    );
  }

  if (respuesta.status === 204) {
    return undefined as T;
  }

  return (await respuesta.json()) as T;
}
