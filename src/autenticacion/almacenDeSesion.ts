/**
 * Dónde vive el token de acceso: **en memoria y en ningún otro sitio** (ADR-0015, punto 6).
 *
 * Esto merece una explicación, porque la alternativa es más cómoda y está por todas partes. Un
 * token guardado en `localStorage` sobrevive a la recarga y ahorra renovar la sesión, pero queda
 * al alcance de **cualquier script que se ejecute en la página**. Basta una dependencia
 * comprometida o un XSS para que se lo lleve, y como el token no caduca al cerrar la pestaña, el
 * robo sirve durante horas.
 *
 * En memoria, un script malicioso tendría que estar ejecutándose en ese instante y dentro de este
 * módulo. El precio es real y hay que asumirlo: **al recargar la página se pierde la sesión**, así
 * que hay que renovarla en silencio contra el proveedor de identidad. Ese precio se paga una vez
 * al programar; el otro se paga cuando alguien roba las sesiones de todos los usuarios.
 *
 * Por eso esto es un módulo y no una variable suelta: el token nunca sale de aquí entero salvo
 * para construir la cabecera de la petición.
 */

export interface Sesion {
  readonly token: string;
  readonly expiraEn: number;
  readonly nombre: string;
  readonly personaId: string;
}

type Escucha = (sesion: Sesion | null) => void;

let sesionActual: Sesion | null = null;

/**
 * La vista sin token, **calculada una sola vez por sesión**.
 *
 * Que esto sea un valor guardado y no un objeto nuevo en cada llamada no es una optimización: es
 * una corrección. La interfaz se suscribe a este almacén con `useSyncExternalStore`, que compara
 * la instantánea con la anterior **por identidad**. Devolviendo un objeto nuevo cada vez, React
 * concluye que la sesión cambió en cada dibujado, vuelve a dibujar, obtiene otro objeto nuevo y
 * así hasta que aborta con «Maximum update depth exceeded» y deja la pantalla en blanco.
 *
 * Ocurrió de verdad: el inicio de sesión funcionaba, el token se canjeaba bien y la aplicación se
 * quedaba en blanco justo al volver. Las pruebas del almacén no lo vieron porque comprueban sus
 * valores, no un componente que lo consuma; se detectó mirando la consola del navegador.
 */
let vistaSinToken: Omit<Sesion, 'token'> | null = null;

const escuchas = new Set<Escucha>();

function avisar(): void {
  for (const escucha of escuchas) {
    escucha(sesionActual);
  }
}

function fijar(sesion: Sesion | null): void {
  sesionActual = sesion;

  vistaSinToken =
    sesion === null
      ? null
      : { nombre: sesion.nombre, personaId: sesion.personaId, expiraEn: sesion.expiraEn };

  avisar();
}

export function guardarSesion(sesion: Sesion): void {
  fijar(sesion);
}

export function cerrarSesion(): void {
  fijar(null);
}

/**
 * El token para la cabecera `Authorization`, o null si no hay sesión o ya venció.
 *
 * Se comprueba la caducidad **aquí** y no solo al recibirlo: una pestaña puede quedarse abierta
 * horas, y mandar un token vencido produce un 401 que el usuario vería como un error raro en vez
 * de como una sesión que expiró.
 */
export function tokenVigente(ahora: number = Date.now()): string | null {
  if (sesionActual === null) {
    return null;
  }

  if (sesionActual.expiraEn <= ahora) {
    fijar(null);
    return null;
  }

  return sesionActual.token;
}

/** Los datos de quien está dentro, sin el token: es lo que la interfaz necesita para mostrarse. */
export function quienEstaDentro(): Omit<Sesion, 'token'> | null {
  return vistaSinToken;
}

export function alCambiarLaSesion(escucha: Escucha): () => void {
  escuchas.add(escucha);
  return () => {
    escuchas.delete(escucha);
  };
}

/** Solo para las pruebas: deja el módulo como recién cargado. */
export function reiniciarParaPruebas(): void {
  sesionActual = null;
  vistaSinToken = null;
  escuchas.clear();
}
