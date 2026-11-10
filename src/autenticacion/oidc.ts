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

  return (await canjear(config, codigo, verificador))
    ? { exito: true, destino, error: null }
    : { exito: false, destino, error: 'No se pudo completar el inicio de sesión.' };
}

/**
 * Canjea el código por el token y abre la sesión. Devuelve si lo consiguió.
 *
 * Está aparte porque lo usan los dos caminos: el retorno del inicio de sesión normal y la
 * renovación silenciosa. Duplicar esto habría sido duplicar la parte que toca el token.
 */
async function canjear(
  config: ConfiguracionIdentidad,
  codigo: string,
  verificador: string,
): Promise<boolean> {
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
      return false;
    }

    const datos = (await respuesta.json()) as { access_token?: string; id_token?: string };

    if (typeof datos.access_token !== 'string' || typeof datos.id_token !== 'string') {
      return false;
    }

    const identidad = leerTokenSinValidar(datos.id_token);
    if (identidad === null) {
      return false;
    }

    guardarSesion({
      token: datos.access_token,
      expiraEn: identidad.expiraEn,
      nombre: identidad.nombre,
      personaId: identidad.sub,
    });

    return true;
  } catch {
    return false;
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

/** Cuánto se espera a que el proveedor conteste en silencio antes de rendirse. */
const ESPERA_RENOVACION_MS = 12_000;

/**
 * Recupera la sesión sin molestar al usuario, si el proveedor todavía lo reconoce.
 *
 * **El problema que resuelve.** El token vive solo en memoria (ADR-0015), así que cualquier recarga
 * de la página lo borra y el usuario aparece como desconectado aunque su sesión en el proveedor
 * siga abierta. Eso convierte un F5 en un cierre de sesión, y durante una demostración es un
 * sobresalto garantizado.
 *
 * **Cómo funciona.** Se repite el flujo de autorización dentro de un marco oculto, con
 * `prompt=none`: el proveedor responde de inmediato, sin enseñar nada. Si reconoce al usuario
 * devuelve un código; si no, un error que aquí significa simplemente «no hay sesión» y no se le
 * cuenta a nadie.
 *
 * La respuesta llega por mensaje entre ventanas y no por redirección, porque una redirección
 * dentro del marco recargaría la aplicación entera, que es justo lo que se quiere evitar. Eso exige
 * que el origen esté en la lista de orígenes permitidos del proveedor.
 *
 * **El verificador se queda en memoria**, a diferencia del inicio de sesión normal: aquí la página
 * nunca se abandona, así que no hay nada que sobreviva a una navegación y no hace falta tocar el
 * almacenamiento del navegador.
 *
 * **Una limitación que conviene saber.** Esto se apoya en la cookie del proveedor leída desde un
 * marco de otro origen. Los navegadores están restringiendo esas cookies, así que puede dejar de
 * funcionar; cuando falla, el usuario simplemente tiene que entrar a mano, que es el comportamiento
 * de antes. Es una mejora de comodidad, no algo de lo que dependa la plataforma.
 */
export async function renovarEnSilencio(): Promise<boolean> {
  const config = configuracion();
  if (config === null) {
    return false;
  }

  const verificador = generarVerificador();
  const estado = generarEstado();

  const parametros = new URLSearchParams({
    response_type: 'code',
    client_id: config.clienteId,
    redirect_uri: config.redireccion,
    scope: 'openid profile email',
    state: estado,
    code_challenge: await calcularReto(verificador),
    code_challenge_method: 'S256',

    // Las dos claves de todo esto: que el proveedor no muestre nada y que conteste por mensaje.
    prompt: 'none',
    response_mode: 'web_message',
  });

  if (config.audiencia !== '') {
    parametros.set('audience', config.audiencia);
  }

  const respuesta = await preguntarEnSilencio(
    config.emisor,
    `${config.emisor}/authorize?${parametros.toString()}`,
  );

  // El estado se comprueba igual que en el retorno normal: una respuesta que no corresponde a esta
  // petición se descarta sin canjear nada.
  if (respuesta === null || respuesta.state !== estado || respuesta.code === undefined) {
    return false;
  }

  return canjear(config, respuesta.code, verificador);
}

interface RespuestaSilenciosa {
  readonly code?: string;
  readonly state?: string;
  readonly error?: string;
}

/**
 * Abre un marco oculto y espera la respuesta del proveedor.
 *
 * Se comprueba el origen de cada mensaje antes de mirarlo: una página puede recibir mensajes de
 * cualquiera, y creerse uno que diga traer un código de autorización sería aceptar una sesión de
 * quien quisiera dárnosla.
 *
 * Y siempre se limpia: el marco se quita y el oyente se desengancha pase lo que pase, incluso si el
 * proveedor no contesta nunca. Un marco olvidado en cada recarga es una fuga de memoria lenta.
 */
function preguntarEnSilencio(emisor: string, url: string): Promise<RespuestaSilenciosa | null> {
  return new Promise((resolver) => {
    const marco = document.createElement('iframe');
    marco.style.display = 'none';
    marco.setAttribute('aria-hidden', 'true');
    marco.title = 'Renovación de sesión';

    let terminado = false;

    const limpiar = (resultado: RespuestaSilenciosa | null) => {
      if (terminado) {
        return;
      }
      terminado = true;

      window.removeEventListener('message', alMensaje);
      clearTimeout(temporizador);
      marco.remove();
      resolver(resultado);
    };

    const alMensaje = (evento: MessageEvent) => {
      if (evento.origin !== emisor) {
        return;
      }

      const dato = evento.data as { type?: string; response?: RespuestaSilenciosa } | null;
      if (dato?.type !== 'authorization_response') {
        return;
      }

      limpiar(dato.response ?? null);
    };

    const temporizador = setTimeout(() => limpiar(null), ESPERA_RENOVACION_MS);

    window.addEventListener('message', alMensaje);
    marco.src = url;
    document.body.appendChild(marco);
  });
}
