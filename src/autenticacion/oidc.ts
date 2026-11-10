import { calcularReto, generarEstado, generarVerificador, leerTokenSinValidar } from './pkce';
import { guardarSesion } from './almacenDeSesion';
import { irA } from './navegacion';

/**
 * El flujo de código de autorización con PKCE contra el proveedor de identidad (ADR-0004).
 *
 * La plataforma **no custodia contraseñas**: el usuario se autentica en el proveedor y vuelve con
 * un token que la API valida. Este módulo es solo el intermediario de esa ida y vuelta.
 */

export interface ConfiguracionIdentidad {
  readonly emisor: string;
  readonly clienteId: string;
  readonly audiencia: string;
  readonly redireccion: string;
}

/** Claves de lo que debe sobrevivir al salto al proveedor. Con prefijo para no chocar con nada. */
const CLAVE_VERIFICADOR = 'ucokudos.pkce.verificador';
const CLAVE_ESTADO = 'ucokudos.pkce.estado';
const CLAVE_DESTINO = 'ucokudos.pkce.destino';

export function configuracion(): ConfiguracionIdentidad | null {
  const emisor = import.meta.env['VITE_IDENTIDAD_EMISOR'];
  const clienteId = import.meta.env['VITE_IDENTIDAD_CLIENTE'];

  // Sin proveedor configurado la aplicación funciona igual, con lo que es público. Es deliberado:
  // permite levantar el entorno y ver el muro antes de tener identidad, igual que hace la API.
  if (
    typeof emisor !== 'string' ||
    emisor === '' ||
    typeof clienteId !== 'string' ||
    clienteId === ''
  ) {
    return null;
  }

  const audiencia = import.meta.env['VITE_IDENTIDAD_AUDIENCIA'];

  return {
    emisor: emisor.replace(/\/$/, ''),
    clienteId,
    audiencia: typeof audiencia === 'string' ? audiencia : '',
    redireccion: `${window.location.origin}/retorno`,
  };
}

/**
 * Guarda lo que tiene que sobrevivir al salto al proveedor.
 *
 * **Aquí sí se usa el almacenamiento del navegador, y es la única excepción de toda la aplicación.
 * Conviene justificarla, porque hay una regla del analizador que lo prohíbe.**
 *
 * El motivo es que el navegador **abandona la página** para ir al proveedor y vuelve con una carga
 * nueva: la memoria se pierde entera por definición. El verificador tiene que estar al volver, o el
 * canje del código es imposible.
 *
 * Y lo que se guarda no es un token, que es lo que la regla protege. El verificador es un secreto
 * **de un solo uso que no sirve para nada por sí mismo**: hace falta además el código de
 * autorización, que el proveedor entrega una sola vez y caduca en segundos. Un token robado da
 * acceso durante horas; un verificador robado no da acceso a nada.
 *
 * Se usa `sessionStorage` y no `localStorage` porque muere con la pestaña, y se borra en cuanto se
 * usa.
 */
function recordarParaElRetorno(verificador: string, estado: string, destino: string): void {
  // eslint-disable-next-line no-restricted-properties -- Ver la explicación de arriba: no es un token.
  sessionStorage.setItem(CLAVE_VERIFICADOR, verificador);
  // eslint-disable-next-line no-restricted-properties -- Ídem.
  sessionStorage.setItem(CLAVE_ESTADO, estado);
  // eslint-disable-next-line no-restricted-properties -- Ídem: solo una ruta de esta aplicación.
  sessionStorage.setItem(CLAVE_DESTINO, destino);
}

function recuperarYOlvidar(clave: string): string | null {
  // eslint-disable-next-line no-restricted-properties -- Ver recordarParaElRetorno.
  const valor = sessionStorage.getItem(clave);
  // eslint-disable-next-line no-restricted-properties -- Se borra en cuanto se usa: es de un solo uso.
  sessionStorage.removeItem(clave);
  return valor;
}

/**
 * Lleva al usuario al proveedor para que se autentique.
 *
 * Se recuerda dónde estaba para devolverlo ahí al volver. Perder la página en la que se estaba es
 * un detalle pequeño que estropea la experiencia: nadie quiere acabar en el muro cuando lo que
 * intentaba era publicar.
 */
export async function iniciarSesion(destino: string = window.location.pathname): Promise<void> {
  const config = configuracion();
  if (config === null) {
    throw new Error('No hay proveedor de identidad configurado.');
  }

  const verificador = generarVerificador();
  const estado = generarEstado();
  recordarParaElRetorno(verificador, estado, destino);

  const parametros = new URLSearchParams({
    response_type: 'code',
    client_id: config.clienteId,
    redirect_uri: config.redireccion,
    scope: 'openid profile email',
    state: estado,
    code_challenge: await calcularReto(verificador),
    code_challenge_method: 'S256',
  });

  if (config.audiencia !== '') {
    parametros.set('audience', config.audiencia);
  }

  irA(`${config.emisor}/authorize?${parametros.toString()}`);
}

export interface ResultadoRetorno {
  readonly exito: boolean;
  readonly destino: string;
  readonly error: string | null;
}

/**
 * Procesa la vuelta del proveedor: comprueba el estado y canjea el código por el token.
 *
 * **El orden importa.** Lo primero es comprobar el estado, antes de canjear nada: si no coincide,
 * esta respuesta no corresponde a un inicio de sesión que haya empezado esta aplicación, y hay que
 * descartarla entera sin tocar el código.
 */
export async function procesarRetorno(parametrosUrl: string): Promise<ResultadoRetorno> {
  const config = configuracion();
  const parametros = new URLSearchParams(parametrosUrl);

  const estadoEsperado = recuperarYOlvidar(CLAVE_ESTADO);
  const verificador = recuperarYOlvidar(CLAVE_VERIFICADOR);
  const destino = recuperarYOlvidar(CLAVE_DESTINO) ?? '/';

  if (config === null) {
    return { exito: false, destino: '/', error: 'No hay proveedor de identidad configurado.' };
  }

  // El proveedor puede devolver un error en lugar de un código: por ejemplo si el usuario cancela.
  const errorDelProveedor = parametros.get('error');
  if (errorDelProveedor !== null) {
    return {
      exito: false,
      destino,
      error:
        errorDelProveedor === 'access_denied'
          ? 'Cancelaste el inicio de sesión.'
          : 'El proveedor de identidad rechazó la petición.',
    };
  }

  const estadoRecibido = parametros.get('state');
  if (estadoEsperado === null || estadoRecibido !== estadoEsperado) {
    // Esto no es un error del usuario: o bien el flujo no lo inició esta aplicación, o se recargó
    // la página de retorno. En ambos casos lo correcto es no canjear nada.
    return {
      exito: false,
      destino: '/',
      error: 'La respuesta no corresponde a un inicio de sesión de esta aplicación.',
    };
  }

  const codigo = parametros.get('code');
  if (codigo === null || verificador === null) {
    return { exito: false, destino, error: 'La respuesta del proveedor llegó incompleta.' };
  }

  try {
    const respuesta = await fetch(`${config.emisor}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.clienteId,
        code: codigo,
        redirect_uri: config.redireccion,
        code_verifier: verificador,
      }).toString(),
    });

    if (!respuesta.ok) {
      return { exito: false, destino, error: 'No se pudo completar el inicio de sesión.' };
    }

    const datos = (await respuesta.json()) as { access_token?: string; id_token?: string };

    if (typeof datos.access_token !== 'string' || typeof datos.id_token !== 'string') {
      return { exito: false, destino, error: 'El proveedor no devolvió un token válido.' };
    }

    const identidad = leerTokenSinValidar(datos.id_token);
    if (identidad === null) {
      return { exito: false, destino, error: 'El token recibido no se pudo leer.' };
    }

    guardarSesion({
      token: datos.access_token,
      expiraEn: identidad.expiraEn,
      nombre: identidad.nombre,
      personaId: identidad.sub,
    });

    return { exito: true, destino, error: null };
  } catch {
    return { exito: false, destino, error: 'Sin conexión con el proveedor de identidad.' };
  }
}

/**
 * Cierra la sesión también en el proveedor, no solo aquí.
 *
 * Borrar el token local y quedarse es un cierre de sesión falso: la siguiente vez que el usuario
 * pulse «entrar», el proveedor lo reconoce y vuelve a entrar sin pedir nada. En un equipo
 * compartido, que es el caso de una sala de cómputo de la universidad, eso significa que el
 * siguiente que se siente entra con la cuenta del anterior.
 */
export function cerrarSesionEnElProveedor(): void {
  const config = configuracion();
  if (config === null) {
    return;
  }

  const parametros = new URLSearchParams({
    client_id: config.clienteId,
    returnTo: window.location.origin,
  });

  irA(`${config.emisor}/v2/logout?${parametros.toString()}`);
}
