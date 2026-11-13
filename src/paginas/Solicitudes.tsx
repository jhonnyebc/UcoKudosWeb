import { type FormEvent, useCallback, useEffect, useId, useState } from 'react';

import { ErrorDeApi, pedir } from '../api/cliente';
import type { PersonaConSolicitud } from '../api/tipos';

/**
 * Solicitudes de cuenta que le toca resolver a quien está dentro (RF-03).
 *
 * Cada aprobador ve **solo las de su ámbito**, y la regla la aplica el servidor: un Coordinador de
 * Programa ve a los estudiantes y docentes de sus programas, no los de otros. Esta pantalla no
 * decide nada; muestra lo que la API le da y reenvía la decisión.
 *
 * Aprobar no activa la cuenta por sí solo: además hacen falta el correo y el celular verificados
 * (RF-02). La lista lo dice, para que nadie crea que aprobó y la persona ya puede entrar.
 */
export function Solicitudes() {
  const [pendientes, setPendientes] = useState<readonly PersonaConSolicitud[] | null>(null);
  const [errorDeCarga, setErrorDeCarga] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setPendientes(await pedir<PersonaConSolicitud[]>('/identidad/solicitudes/pendientes'));
      setErrorDeCarga(null);
    } catch (causa) {
      setPendientes(null);
      setErrorDeCarga(
        causa instanceof ErrorDeApi ? causa.message : 'No se pudieron cargar las solicitudes.',
      );
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function resolver(accion: () => Promise<unknown>, exito: string, fallo: string) {
    setError(null);
    setAviso(null);

    try {
      await accion();
      setAviso(exito);
      await cargar();
    } catch (causa) {
      setError(causa instanceof ErrorDeApi ? causa.message : fallo);
    }
  }

  if (errorDeCarga !== null) {
    return (
      <>
        <h1>Solicitudes</h1>
        <p className="error" role="alert">
          {errorDeCarga}
        </p>
      </>
    );
  }

  if (pendientes === null) {
    return (
      <>
        <h1>Solicitudes</h1>
        <p role="status">Cargando…</p>
      </>
    );
  }

  return (
    <>
      <h1>Solicitudes</h1>
      <p className="subtitulo">Cuentas que esperan tu aprobación, según tu rol y tu ámbito.</p>

      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {aviso !== null && (
        <p className="exito" role="status">
          {aviso}
        </p>
      )}

      {pendientes.length === 0 ? (
        <p>No tienes solicitudes pendientes.</p>
      ) : (
        <ul className="lista-kudos" aria-label="Solicitudes pendientes">
          {pendientes.map((p) => (
            <li key={p.id}>
              <TarjetaDeSolicitud
                persona={p}
                alAprobar={() =>
                  resolver(
                    () => pedir(`/identidad/solicitudes/${p.id}/aprobar`, { metodo: 'POST' }),
                    `Aprobaste la solicitud de ${p.nombreCompleto}.`,
                    'No se pudo aprobar la solicitud.',
                  )
                }
                alRechazar={(motivo) =>
                  resolver(
                    () =>
                      pedir(`/identidad/solicitudes/${p.id}/rechazar`, {
                        metodo: 'POST',
                        cuerpo: { motivo },
                      }),
                    `Rechazaste la solicitud de ${p.nombreCompleto}.`,
                    'No se pudo rechazar la solicitud.',
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function TarjetaDeSolicitud({
  persona,
  alAprobar,
  alRechazar,
}: {
  persona: PersonaConSolicitud;
  alAprobar: () => Promise<void>;
  alRechazar: (motivo: string) => Promise<void>;
}) {
  const id = useId();
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const verificaciones = [
    persona.correoVerificado ? 'correo verificado' : 'correo sin verificar',
    persona.celularVerificado ? 'celular verificado' : 'celular sin verificar',
  ].join(' · ');

  async function rechazar(evento: FormEvent) {
    evento.preventDefault();
    setOcupado(true);
    await alRechazar(motivo.trim());
    setOcupado(false);
  }

  async function aprobar() {
    setOcupado(true);
    await alAprobar();
    setOcupado(false);
  }

  return (
    <article className="tarjeta tarjeta-kudo">
      <h2>{persona.nombreCompleto}</h2>
      <p className="categoria">{persona.rol}</p>
      <p>{persona.correoInstitucional}</p>
      <p className="meta">{verificaciones}</p>

      {!rechazando ? (
        <div className="acciones">
          <button type="button" disabled={ocupado} onClick={() => void aprobar()}>
            Aprobar
          </button>
          <button type="button" className="secundario" onClick={() => setRechazando(true)}>
            Rechazar…
          </button>
        </div>
      ) : (
        <form onSubmit={(e) => void rechazar(e)}>
          <label htmlFor={`${id}-motivo`}>Motivo del rechazo</label>
          <input
            id={`${id}-motivo`}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            required
          />
          <div className="acciones">
            <button type="submit" disabled={ocupado || motivo.trim() === ''}>
              Confirmar rechazo
            </button>
            <button type="button" className="secundario" onClick={() => setRechazando(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
