import { pedir } from '../api/cliente';

/**
 * Suscripción del navegador a Web Push (RF-16, ADR-0009).
 *
 * El orden de los pasos no es arbitrario y conviene entenderlo:
 *
 *  1. Se pide al servidor la **clave pública VAPID**. No es secreta: sirve para que el servicio de
 *     push sepa que los envíos vienen de nuestro servidor y no de cualquiera.
 *  2. Se pide **permiso al usuario**, y esto solo funciona como respuesta a un gesto suyo. El
 *     navegador ignora la petición si se hace al cargar la página, y además es lo correcto: nadie
 *     quiere que una web le pida notificaciones antes de saber qué es.
 *  3. Se suscribe al navegador, que devuelve un endpoint y dos claves.
 *  4. Se registra en el servidor.
 *
 * Si algo falla en medio se deshace lo hecho, para no dejar al navegador suscrito contra un
 * servidor que no lo conoce: esa combinación produce avisos que no llegan a ninguna parte.
 */

export type EstadoPush = 'no-soportado' | 'denegado' | 'inactivo' | 'activo';

export function estadoDelNavegador(): EstadoPush {
  if (
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    return 'no-soportado';
  }

  if (Notification.permission === 'denied') {
    return 'denegado';
  }

  return 'inactivo';
}

/**
 * ¿Ya hay una suscripción viva en este navegador?
 *
 * Se consulta en cada arranque y, si la hay, se vuelve a registrar en el servidor. Parece
 * redundante y no lo es: el navegador puede renovar la suscripción por su cuenta, y si el servidor
 * se queda con la antigua, los avisos dejan de llegar sin que nada parezca fallar. El registro es
 * idempotente, así que repetirlo no cuesta nada.
 */
export async function sincronizarSuscripcion(): Promise<EstadoPush> {
  if (estadoDelNavegador() !== 'inactivo') {
    return estadoDelNavegador();
  }

  const registro = await navigator.serviceWorker.ready;
  const suscripcion = await registro.pushManager.getSubscription();

  if (suscripcion === null) {
    return 'inactivo';
  }

  await registrarEnElServidor(suscripcion);
  return 'activo';
}

export async function activarAvisos(): Promise<EstadoPush> {
  const estado = estadoDelNavegador();
  if (estado !== 'inactivo') {
    return estado;
  }

  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') {
    return permiso === 'denied' ? 'denegado' : 'inactivo';
  }

  const { clavePublica } = await pedir<{ clavePublica: string }>('/avisos/clave-publica');
  const registro = await navigator.serviceWorker.ready;

  const suscripcion = await registro.pushManager.subscribe({
    // El navegador exige que cada push produzca una notificación visible. Es una restricción del
    // navegador, no una opción nuestra: un push silencioso serviría para rastrear a alguien.
    userVisibleOnly: true,
    applicationServerKey: aBytes(clavePublica),
  });

  try {
    await registrarEnElServidor(suscripcion);
  } catch (causa) {
    // Si el servidor no pudo guardarla, se deshace la suscripción del navegador. Dejarla viva
    // contra un servidor que no la conoce es peor que no tenerla: el usuario creería que tiene
    // avisos activados y no le llegaría ninguno.
    await suscripcion.unsubscribe();
    throw causa;
  }

  return 'activo';
}

export async function desactivarAvisos(): Promise<EstadoPush> {
  const registro = await navigator.serviceWorker.ready;
  const suscripcion = await registro.pushManager.getSubscription();

  if (suscripcion === null) {
    return 'inactivo';
  }

  // Primero el servidor y después el navegador: al revés, si fallara la baja en el servidor, nos
  // quedaríamos sin forma de identificar qué suscripción había que dar de baja.
  await pedir<void>(`/avisos/suscripciones?endpoint=${encodeURIComponent(suscripcion.endpoint)}`, {
    metodo: 'DELETE',
  });

  await suscripcion.unsubscribe();
  return 'inactivo';
}

async function registrarEnElServidor(suscripcion: PushSubscription): Promise<void> {
  const datos = suscripcion.toJSON();
  const claves = datos.keys ?? {};

  if (claves['p256dh'] === undefined || claves['auth'] === undefined) {
    throw new Error('El navegador no entregó las claves de la suscripción.');
  }

  await pedir<void>('/avisos/suscripciones', {
    metodo: 'POST',
    cuerpo: {
      endpoint: suscripcion.endpoint,
      claveP256dh: claves['p256dh'],
      claveAuth: claves['auth'],
    },
  });
}

/**
 * Convierte la clave VAPID de base64url a bytes, que es lo que el navegador espera.
 *
 * No hay atajo: `atob` no entiende el alfabeto seguro para URL —usa `-` y `_` en lugar de `+` y
 * `/`— ni el relleno omitido, así que hay que traducirlo antes.
 */
function aBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const relleno = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + relleno).replace(/-/g, '+').replace(/_/g, '/');

  const binario = atob(base64);

  // El búfer se crea explícitamente para que el tipo sea `ArrayBuffer` y no el genérico que admite
  // memoria compartida: el navegador no acepta memoria compartida para la clave, y el compilador
  // lo rechaza con razón.
  const bytes = new Uint8Array(new ArrayBuffer(binario.length));
  for (let i = 0; i < binario.length; i++) {
    bytes[i] = binario.charCodeAt(i);
  }

  return bytes;
}
