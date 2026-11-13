import { type FormEvent, useId, useState } from 'react';

import { ErrorDeApi, pedir } from '../api/cliente';
import { puedeVetar, useMiRol } from '../autenticacion/useMiRol';

interface Props {
  readonly tipo: 'Kudo' | 'Replica';
  readonly contenidoId: string;

  /** Se llama cuando el contenido se vetó, para que quien lo pintó lo retire de la pantalla. */
  readonly alVetar: () => void;
}

type Accion = 'reportar' | 'vetar' | null;

/**
 * Reportar y vetar un contenido (RF-11, RF-12).
 *
 * **Reportar lo puede hacer cualquiera; vetar, solo el Rector y el Coordinador Académico**, y la
 * regla la aplica la API: el botón «Vetar» se esconde a los demás por cortesía, no por seguridad.
 *
 * Los dos pasos piden un motivo, y vetar pide además una confirmación explícita: un veto oculta el
 * contenido para todos y avisa a su autor, y no hay botón para deshacerlo.
 */
export function AccionesDeModeracion({ tipo, contenidoId, alVetar }: Props) {
  const id = useId();
  const rol = useMiRol();

  const [accion, setAccion] = useState<Accion>(null);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  function cerrar() {
    setAccion(null);
    setMotivo('');
    setError(null);
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);

    try {
      if (accion === 'reportar') {
        await pedir('/moderacion/reportes', {
          metodo: 'POST',
          cuerpo: { tipoContenido: tipo, contenidoId, motivo: motivo.trim() },
        });
        cerrar();
        setAviso('Gracias: tu reporte llegó a quien modera.');
      } else {
        await pedir('/moderacion/vetos', {
          metodo: 'POST',
          cuerpo: { tipoContenido: tipo, contenidoId, motivo: motivo.trim() },
        });
        alVetar();
      }
    } catch (causa) {
      setError(
        causa instanceof ErrorDeApi
          ? causa.message
          : accion === 'reportar'
            ? 'No se pudo enviar el reporte.'
            : 'No se pudo vetar el contenido.',
      );
    } finally {
      setEnviando(false);
    }
  }

  if (aviso !== null) {
    return (
      <p className="meta" role="status">
        {aviso}
      </p>
    );
  }

  if (accion === null) {
    return (
      <div className="acciones">
        <button type="button" className="secundario" onClick={() => setAccion('reportar')}>
          Reportar
        </button>

        {puedeVetar(rol) && (
          <button type="button" className="peligro" onClick={() => setAccion('vetar')}>
            Vetar
          </button>
        )}
      </div>
    );
  }

  const vetando = accion === 'vetar';

  return (
    <form onSubmit={(e) => void enviar(e)} className="formulario-moderacion">
      <label htmlFor={`${id}-motivo`}>{vetando ? 'Motivo del veto' : 'Motivo del reporte'}</label>
      <input
        id={`${id}-motivo`}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        required
        autoFocus
      />

      {vetando && (
        <p className="meta">
          Vetar oculta este contenido —y sus respuestas— para todos y avisa a su autor con el
          motivo. No se puede deshacer desde aquí.
        </p>
      )}

      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="acciones">
        <button
          type="submit"
          className={vetando ? 'peligro' : undefined}
          disabled={enviando || motivo.trim() === ''}
        >
          {vetando ? 'Confirmar veto' : 'Enviar reporte'}
        </button>
        <button type="button" className="secundario" onClick={cerrar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
