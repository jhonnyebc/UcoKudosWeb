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

/**
 * Saca del cuerpo el motivo concreto que dio la API, si lo dio.
 *
 * **Sin esto el cliente oculta lo único que le serviría al usuario.** La API responde un
 * ProblemDetails cuya propiedad `detail` trae la regla que se incumplió —«No se puede publicar un
 * Kudo para uno mismo»—, y enseñar en su lugar «hay algo mal en los datos» obliga a adivinar qué
 * campo está mal cuando ningún campo lo está.
 *
 * Solo se usa por debajo de 500 y es deliberado: el detalle de un 4xx describe lo que hizo quien
 * llama, mientras que el de un 5xx describe las tripas del servidor y no es asunto suyo.
 *
 * Nunca lanza. Un error aquí dejaría al usuario sin ningún mensaje, que es peor que uno genérico.
 */
async function detalleDeLaApi(respuesta: Response): Promise<string | null> {
  if (respuesta.status >= 500) {
    return null;
  }

  try {
    const cuerpo: unknown = await respuesta.json();

    if (typeof cuerpo !== 'object' || cuerpo === null) {
      return null;
    }

    const detalle = (cuerpo as Record<string, unknown>)['detail'];

    return typeof detalle === 'string' && detalle.trim() !== '' ? detalle.trim() : null;
  } catch {
    return null;
  }
}

interface OpcionesPeticion {
  readonly metodo?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly cuerpo?: unknown;
  /** Un archivo como cuerpo, tal cual y con su propio tipo. Excluyente con `cuerpo`. */
  readonly archivo?: File;
  readonly senal?: AbortSignal;
}

/**
 * Hace la petición con la sesión y traduce los fallos. Es el tronco común de `pedir` (JSON) y
 * `pedirArchivo` (bytes): así los archivos pasan por la misma autenticación y los mismos mensajes de
 * error, y no existe un segundo camino donde olvidarse del token.
 */
async function enviar(
  ruta: string,
  opciones: OpcionesPeticion,
  aceptar: string,
): Promise<Response> {
  const { metodo = 'GET', cuerpo, archivo, senal } = opciones;

  const cabeceras: Record<string, string> = { Accept: aceptar };

  const token = tokenVigente();
  if (token !== null) {
    cabeceras['Authorization'] = `Bearer ${token}`;
  }

  if (archivo !== undefined) {
    cabeceras['Content-Type'] = archivo.type;
  } else if (cuerpo !== undefined) {
    cabeceras['Content-Type'] = 'application/json';
  }

  let respuesta: Response;

  try {
    respuesta = await fetch(`${BASE}${ruta}`, {
      method: metodo,
      headers: cabeceras,
      body: archivo ?? (cuerpo === undefined ? null : JSON.stringify(cuerpo)),
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
    // El motivo que da la API manda sobre el mensaje por estado: es más concreto y ya viene
    // redactado para una persona. El genérico queda como red de seguridad cuando no hay motivo.
    const detalle = await detalleDeLaApi(respuesta);

    throw new ErrorDeApi(
      respuesta.status,
      detalle ?? mensajeSegunEstado(respuesta.status),
      respuesta.status === 401,
    );
  }

  return respuesta;
}

export async function pedir<T>(ruta: string, opciones: OpcionesPeticion = {}): Promise<T> {
  const respuesta = await enviar(ruta, opciones, 'application/json');

  // Una respuesta sin cuerpo no es un error: 204 «sin contenido» y 202 «aceptado» (reportar) llegan
  // vacías. Intentar leerlas como JSON lanzaba, y la pantalla decía «no se pudo enviar» de algo que
  // sí se había enviado. Lo encontraron las pruebas del botón «Reportar».
  const texto = await respuesta.text();

  return (texto === '' ? undefined : JSON.parse(texto)) as T;
}

/** Descarga un archivo con la sesión de quien lo pide, como `Blob`. */
export async function pedirArchivo(ruta: string, senal?: AbortSignal): Promise<Blob> {
  const respuesta = await enviar(ruta, senal ? { senal } : {}, '*/*');
  return await respuesta.blob();
}
