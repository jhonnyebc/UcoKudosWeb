/**
 * PKCE: la prueba que impide que alguien use un código de autorización robado (ADR-0015, punto 6).
 *
 * El problema que resuelve, en concreto. El proveedor de identidad devuelve el código por la
 * **barra de direcciones**, así que ese código pasa por sitios donde puede quedar registrado: el
 * historial del navegador, los registros de un proxy, la cabecera `Referer`. Sin PKCE, cualquiera
 * que consiga ese código puede canjearlo por un token y entrar como el usuario.
 *
 * Con PKCE, el cliente inventa un secreto de un solo uso —el verificador— y envía al proveedor solo
 * su huella: el reto. Al canjear el código, tiene que enseñar el verificador original. Quien robe
 * el código no tiene el verificador, y el código no le sirve de nada.
 *
 * Todo esto se apoya en la API de criptografía del navegador, no en una biblioteca: generar
 * aleatoriedad para seguridad con `Math.random()` es un error clásico y grave, porque es predecible.
 */

/** Alfabeto permitido por el estándar para el verificador: sin caracteres que haya que escapar. */
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

/**
 * Genera el verificador: una cadena aleatoria larga.
 *
 * 64 caracteres del alfabeto permitido son unos 384 bits de entropía, muy por encima del mínimo de
 * 43 caracteres que exige el estándar. La longitud es barata y lo que compra es que no se pueda
 * adivinar por fuerza bruta.
 */
export function generarVerificador(): string {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);

  // Se reparte cada byte sobre el alfabeto. El sesgo que introduce el módulo es despreciable con
  // un alfabeto de 64 caracteres, porque 256 es múltiplo exacto de 64.
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join('');
}

/**
 * El reto: la huella SHA-256 del verificador, en base64url.
 *
 * Se usa el método S256 y **no** el llamado «plain», que manda el verificador tal cual y por tanto
 * no protege de nada: quien intercepte la primera petición ya tendría el secreto.
 */
export async function calcularReto(verificador: string): Promise<string> {
  const huella = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verificador));
  return aBase64Url(new Uint8Array(huella));
}

/**
 * El parámetro de estado, que resuelve un problema distinto del de PKCE y conviene no confundirlos.
 *
 * PKCE protege el código. El estado protege contra que alguien **inicie** un flujo de sesión en tu
 * navegador sin que tú lo pidieras: al volver, el cliente comprueba que el estado coincide con el
 * que él mismo generó, y si no, descarta la respuesta entera.
 */
export function generarEstado(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return aBase64Url(bytes);
}

function aBase64Url(bytes: Uint8Array): string {
  let binario = '';
  for (const byte of bytes) {
    binario += String.fromCharCode(byte);
  }

  // base64url: sin relleno y con el alfabeto seguro para URL, que es lo que pide el estándar.
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Lee las partes que interesan de un token de identidad, **sin validar la firma**.
 *
 * La advertencia es importante y por eso está en el nombre de las cosas y aquí: esto sirve para
 * mostrar el nombre del usuario en la pantalla, y para nada más. **Quien valida la firma, el
 * emisor, la audiencia y la caducidad es la API** (ADR-0004); el cliente no puede validarla de
 * forma fiable y creerse lo que diga un token sin verificar sería confiar en algo que el propio
 * usuario puede modificar.
 */
export interface DatosDelToken {
  readonly sub: string;
  readonly nombre: string;
  readonly expiraEn: number;
}

export function leerTokenSinValidar(idToken: string): DatosDelToken | null {
  const partes = idToken.split('.');
  if (partes.length !== 3) {
    return null;
  }

  const carga = partes[1];
  if (carga === undefined) {
    return null;
  }

  try {
    const json = atob(carga.replace(/-/g, '+').replace(/_/g, '/'));
    const datos = JSON.parse(json) as Record<string, unknown>;

    const sub = typeof datos['sub'] === 'string' ? datos['sub'] : null;
    if (sub === null) {
      return null;
    }

    const nombre =
      typeof datos['name'] === 'string'
        ? datos['name']
        : typeof datos['preferred_username'] === 'string'
          ? datos['preferred_username']
          : sub;

    // `exp` viene en segundos desde la época; el resto del cliente trabaja en milisegundos.
    const exp = typeof datos['exp'] === 'number' ? datos['exp'] * 1000 : 0;

    return { sub, nombre, expiraEn: exp };
  } catch {
    return null;
  }
}
