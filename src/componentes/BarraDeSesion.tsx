import { useSesion } from '../autenticacion/useSesion';

/**
 * Quién está dentro, y el botón para entrar o salir.
 *
 * Si no hay proveedor de identidad configurado no se dibuja nada, en lugar de un botón que no
 * funcionaría: un control que al pulsarlo da un error es peor que no tener control.
 */
export function BarraDeSesion() {
  const { nombre, estaDentro, hayProveedor, entrar, salir } = useSesion();

  if (!hayProveedor) {
    return null;
  }

  return (
    <div className="barra-sesion">
      {estaDentro ? (
        <>
          <span className="barra-sesion__nombre">{nombre}</span>
          <button type="button" className="secundario" onClick={salir}>
            Salir
          </button>
        </>
      ) : (
        <button type="button" onClick={entrar}>
          Entrar
        </button>
      )}
    </div>
  );
}
