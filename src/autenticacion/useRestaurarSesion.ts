import { useEffect, useState } from 'react';

import { configuracion, renovarEnSilencio } from './oidc';
import { quienEstaDentro } from './almacenDeSesion';

/**
 * Intenta recuperar la sesión al arrancar la aplicación.
 *
 * Devuelve si todavía está intentándolo, para que la interfaz no le diga «necesitas iniciar sesión»
 * a alguien que sí la tiene y está a punto de recuperarla. Ese parpadeo —ver la pantalla de entrar
 * y que un segundo después aparezca tu nombre— se lee como un fallo aunque no lo sea.
 *
 * **No se intenta en la pantalla de retorno.** Ahí hay un código de autorización esperando a
 * canjearse, y lanzar además una renovación en paralelo serían dos inicios de sesión a la vez.
 */
export function useRestaurarSesion(): boolean {
  const esRetorno = window.location.pathname === '/retorno';

  const [restaurando, setRestaurando] = useState(
    () => configuracion() !== null && quienEstaDentro() === null && !esRetorno,
  );

  useEffect(() => {
    if (!restaurando) {
      return;
    }

    let vigente = true;

    void renovarEnSilencio().finally(() => {
      if (vigente) {
        setRestaurando(false);
      }
    });

    return () => {
      vigente = false;
    };

    // Solo al montar: la restauración se intenta una vez por carga de la página y no cada vez que
    // cambia algo. Reintentarla en bucle contra el proveedor sería maltratarlo sin motivo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return restaurando;
}
