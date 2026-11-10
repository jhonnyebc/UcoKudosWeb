import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * El aviso de que hay una versión nueva.
 *
 * ADR-0015 señala el service worker como la fuente de los errores más difíciles de diagnosticar
 * del front, y este componente es la respuesta concreta a esa advertencia. El problema es que una
 * versión cacheada que no se actualiza deja al usuario con una aplicación vieja **sin que nada
 * parezca fallar**: no hay error, no hay pantalla en blanco, simplemente falta lo nuevo. Es un
 * fallo invisible, y los invisibles son los caros.
 *
 * La solución fácil sería recargar sola al detectar versión nueva. No se hace, y por un motivo
 * concreto: recargaría mientras alguien escribe un Kudo y le borraría el texto. Se avisa y decide
 * el usuario.
 */
export function AvisoDeNuevaVersion() {
  const {
    needRefresh: [hayVersionNueva, marcarComoVista],
    updateServiceWorker: actualizar,
  } = useRegisterSW();

  if (!hayVersionNueva) {
    return null;
  }

  return (
    // role="status" y no "alert": es una novedad útil, no una urgencia. Un "alert" interrumpe al
    // lector de pantalla a mitad de frase, y esto no merece interrumpir a nadie.
    <div className="tarjeta aviso-version" role="status">
      <p>Hay una versión nueva de UCO Kudos.</p>
      <div className="aviso-version__acciones">
        <button type="button" onClick={() => void actualizar(true)}>
          Actualizar ahora
        </button>
        <button type="button" className="secundario" onClick={() => marcarComoVista(false)}>
          Más tarde
        </button>
      </div>
    </div>
  );
}
