import { useState } from 'react';

import { ErrorDeApi, pedir } from '../api/cliente';
import type { Verificacion } from '../api/tipos';

/**
 * Verificación de la cadena de auditoría (RF-07, paso 5).
 *
 * **Esta pantalla existe porque sin ella la operación era inalcanzable.** La API la ofrecía desde
 * el principio y está cubierta por pruebas, pero en producción no había forma de ejecutarla: no
 * figuraba en ninguna pantalla y llamarla a mano exige un token que el cliente guarda solo en
 * memoria. Una garantía que nadie puede comprobar no tranquiliza a nadie.
 *
 * No se consulta al entrar, sino al pulsar. Recorrer la cadena es un trabajo proporcional al
 * número de eventos, y no tiene sentido pagarlo cada vez que alguien pasa por aquí.
 */
export function Auditoria() {
  const [resultado, setResultado] = useState<Verificacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(false);

  async function verificar() {
    setVerificando(true);
    setError(null);
    setResultado(null);

    try {
      setResultado(await pedir<Verificacion>('/auditoria/verificacion'));
    } catch (causa) {
      // El 403 de un rol sin permiso llega aquí con el motivo que da la API, y enseñarlo es
      // deliberado: que un Docente vea «el rol Docente no consulta la auditoría» demuestra que la
      // autorización se aplica en el servidor, no que la pantalla esté rota.
      setError(causa instanceof ErrorDeApi ? causa.message : 'No se pudo verificar la cadena.');
    } finally {
      setVerificando(false);
    }
  }

  return (
    <>
      <h1>Auditoría</h1>

      <p>
        Cada acción queda registrada con un hash que depende de sus datos y del hash anterior.
        Verificar la cadena recalcula esos hashes: si alguien editó o borró una fila, deja de
        cuadrar y se señala la primera que no encaja.
      </p>

      <button
        type="button"
        onClick={() => {
          void verificar();
        }}
        disabled={verificando}
      >
        {verificando ? 'Verificando…' : 'Verificar la cadena'}
      </button>

      {/* El resultado se anuncia para quien usa lector de pantalla: es la respuesta a la acción
          que acaba de pedir, y sin esto el botón parecería no hacer nada. */}
      <div aria-live="polite">
        {error !== null && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {resultado !== null && (
          <section>
            <h2>{resultado.intacta ? 'Cadena íntegra' : 'Cadena alterada'}</h2>

            <dl>
              <dt>Eventos revisados</dt>
              <dd>{resultado.eventosRevisados}</dd>

              <dt>Resultado</dt>
              <dd>{resultado.detalle}</dd>

              {resultado.primerEventoAlterado !== null && (
                <>
                  <dt>Primer evento alterado</dt>
                  <dd>{resultado.primerEventoAlterado}</dd>
                </>
              )}
            </dl>
          </section>
        )}
      </div>
    </>
  );
}
