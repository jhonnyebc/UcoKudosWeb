import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { procesarRetorno } from '../autenticacion/oidc';

/**
 * La pantalla a la que el proveedor devuelve al usuario.
 *
 * Dura un instante, pero tiene que existir y hacer tres cosas bien: canjear el código, **limpiar la
 * barra de direcciones** y devolver al usuario donde estaba.
 *
 * Lo de limpiar la dirección no es estética. El código de autorización viaja en la URL, y si se
 * queda ahí acaba en el historial del navegador y se reenvía en la cabecera `Referer` a cualquier
 * recurso externo que la página cargue después. Se sustituye la entrada del historial, con
 * `replace`, para que además el botón de atrás no vuelva a una URL con un código ya gastado.
 */
export function Retorno() {
  const navegar = useNavigate();
  const [error, setError] = useState<string | null>(null);

  // El canje solo puede ocurrir una vez: el código es de un solo uso. React monta dos veces en
  // desarrollo, así que sin esta guarda el segundo intento fallaría y borraría una sesión válida.
  const yaSeProceso = useRef(false);

  useEffect(() => {
    if (yaSeProceso.current) {
      return;
    }
    yaSeProceso.current = true;

    const parametros = window.location.search;

    void procesarRetorno(parametros).then((resultado) => {
      if (resultado.exito) {
        navegar(resultado.destino, { replace: true });
      } else {
        setError(resultado.error);
      }
    });
  }, [navegar]);

  if (error !== null) {
    return (
      <>
        <h1>No se pudo iniciar sesión</h1>
        <p className="error" role="alert">
          {error}
        </p>
        <button type="button" onClick={() => navegar('/', { replace: true })}>
          Volver al muro
        </button>
      </>
    );
  }

  return (
    <>
      <h1>Entrando…</h1>
      <p role="status">Comprobando tu identidad.</p>
    </>
  );
}
