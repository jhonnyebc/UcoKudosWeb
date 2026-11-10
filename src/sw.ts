/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

/**
 * El service worker de UCO Kudos.
 *
 * Está escrito a mano, en lugar de dejar que lo genere la herramienta, por una razón concreta: un
 * service worker generado sabe cachear, pero no sabe qué hacer cuando llega un aviso push. Ese
 * manejador tiene que ser nuestro, porque decide qué ve el usuario en la notificación del sistema
 * y a dónde va al tocarla.
 *
 * Lo que sigue siendo de la herramienta es la lista de archivos a precachear, que se inyecta abajo.
 */

// La lista la rellena el empaquetador: son los archivos del armazón de la aplicación.
precacheAndRoute(self.__WB_MANIFEST);

// Borra las cachés de versiones anteriores. Sin esto, el navegador va acumulando copias viejas que
// nadie usa y que ocupan espacio en el teléfono.
cleanupOutdatedCaches();

/**
 * La actualización la pide la aplicación, no se impone.
 *
 * ADR-0015 avisa de que una versión cacheada que no se actualiza es el fallo más difícil de
 * diagnosticar del front. La respuesta es avisar al usuario y dejar que él decida cuándo recargar:
 * recargar por nuestra cuenta le borraría el Kudo que está escribiendo.
 */
self.addEventListener('message', (evento) => {
  if ((evento.data as { type?: string } | null)?.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});

interface AvisoPush {
  readonly titulo: string;
  readonly cuerpo: string;
  readonly url?: string | null;
}

/**
 * Llega un aviso push.
 *
 * **El navegador exige mostrar una notificación visible.** Recibir un push y no mostrar nada se
 * considera un abuso —serviría para rastrear a alguien en segundo plano— y el navegador castiga a
 * quien lo hace, primero mostrando un aviso genérico y después revocando el permiso. Por eso aquí
 * siempre se muestra algo, incluso si el contenido no se pudo leer.
 *
 * `waitUntil` no es opcional: sin él, el navegador puede apagar el service worker antes de que la
 * notificación llegue a aparecer.
 */
self.addEventListener('push', (evento) => {
  const aviso = leerAviso(evento.data);

  evento.waitUntil(
    self.registration.showNotification(aviso.titulo, {
      body: aviso.cuerpo,
      icon: '/icono-192.png',
      badge: '/icono-192.png',
      lang: 'es-CO',

      // Agrupa los avisos de la plataforma: en un celular, diez notificaciones separadas de la
      // misma aplicación son diez interrupciones.
      tag: 'ucokudos',
      data: { url: aviso.url ?? '/' },
    }),
  );
});

/**
 * El usuario toca la notificación.
 *
 * Si ya hay una ventana de la aplicación abierta se usa esa en lugar de abrir otra. Acumular
 * pestañas duplicadas cada vez que alguien toca un aviso es una molestia pequeña que se repite
 * mucho.
 */
self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();

  const destino = ((evento.notification.data as { url?: string } | null)?.url ?? '/') || '/';

  evento.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

      for (const ventana of ventanas) {
        if (ventana.url.includes(self.location.origin)) {
          await ventana.focus();
          await ventana.navigate(destino).catch(() => undefined);
          return;
        }
      }

      await self.clients.openWindow(destino);
    })(),
  );
});

/**
 * El navegador puede renovar la suscripción por su cuenta, y cuando lo hace la anterior deja de
 * servir. Si no se avisara al servidor, los avisos de esa persona dejarían de llegar sin que nada
 * pareciera fallar.
 *
 * Aquí no hay token, porque el service worker no tiene la sesión. Lo que se hace es dejar constancia
 * para que la aplicación registre la nueva suscripción la próxima vez que se abra.
 */
self.addEventListener('pushsubscriptionchange', (evento) => {
  evento.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const ventana of ventanas) {
        ventana.postMessage({ type: 'SUSCRIPCION_CADUCADA' });
      }
    })(),
  );
});

function leerAviso(datos: PushMessageData | null): AvisoPush {
  if (datos === null) {
    return { titulo: 'UCO Kudos', cuerpo: 'Tienes un aviso nuevo.' };
  }

  try {
    const crudo = datos.json() as Record<string, unknown>;

    // Se aceptan las dos convenciones de nombres por la misma razón que en los avisos en vivo: un
    // desacuerdo de mayúsculas no debe dejar al cliente mudo.
    const texto = (...nombres: string[]): string | null => {
      for (const nombre of nombres) {
        if (typeof crudo[nombre] === 'string') {
          return crudo[nombre];
        }
      }
      return null;
    };

    return {
      titulo: texto('titulo', 'Titulo', 'title') ?? 'UCO Kudos',
      cuerpo: texto('cuerpo', 'Cuerpo', 'body') ?? 'Tienes un aviso nuevo.',
      url: texto('url', 'Url'),
    };
  } catch {
    return { titulo: 'UCO Kudos', cuerpo: datos.text() || 'Tienes un aviso nuevo.' };
  }
}
