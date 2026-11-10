import { useCallback, useSyncExternalStore } from 'react';

import { alCambiarLaSesion, cerrarSesion, quienEstaDentro } from './almacenDeSesion';
import { cerrarSesionEnElProveedor, configuracion, iniciarSesion } from './oidc';

/**
 * La sesión, para los componentes.
 *
 * Usa `useSyncExternalStore` y no un contexto con estado porque el almacén de sesión vive fuera de
 * React: lo escribe el flujo de autenticación, que ocurre durante una navegación del navegador. Es
 * el mecanismo pensado exactamente para esto, y evita que la interfaz se quede enseñando una sesión
 * que ya venció.
 */
export interface Sesion {
  readonly nombre: string | null;
  readonly personaId: string | null;
  readonly estaDentro: boolean;
  readonly hayProveedor: boolean;
  readonly entrar: () => void;
  readonly salir: () => void;
}

function instantanea() {
  return quienEstaDentro();
}

export function useSesion(): Sesion {
  const quien = useSyncExternalStore(alCambiarLaSesion, instantanea, () => null);

  const entrar = useCallback(() => {
    void iniciarSesion(window.location.pathname);
  }, []);

  const salir = useCallback(() => {
    // Primero se borra aquí y después se va al proveedor: si el salto fallara, la sesión local
    // ya no existe, que es el lado seguro del error.
    cerrarSesion();
    cerrarSesionEnElProveedor();
  }, []);

  return {
    nombre: quien?.nombre ?? null,
    personaId: quien?.personaId ?? null,
    estaDentro: quien !== null,
    hayProveedor: configuracion() !== null,
    entrar,
    salir,
  };
}
