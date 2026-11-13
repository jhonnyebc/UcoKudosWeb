import { type FormEvent, useCallback, useId, useState } from 'react';

import { ErrorDeApi, pedir } from '../api/cliente';
import type { Replica } from '../api/tipos';
import { AccionesDeModeracion } from './AccionesDeModeracion';
import { Calificador } from './Calificador';

interface Props {
  readonly kudoId: string;
  readonly total: number;
}

/** Más allá de esta profundidad la sangría deja de crecer: en un celular no cabría. */
const SANGRIA_MAXIMA = 5;

/**
 * Las respuestas de un Kudo (RF-09), bajo demanda y anidadas sin límite de profundidad.
 *
 * **No se cargan con el muro**, igual que los adjuntos: la tarjeta solo trae cuántas hay. El hilo
 * llega de la API **ya ordenado**, cada rama junto a sus descendientes, así que aquí no se reconstruye
 * ningún árbol: se pinta en el orden recibido y la profundidad solo decide la sangría.
 *
 * Responder, calificar, reportar y vetar usan los mismos endpoints que el Kudo, con el tipo
 * «Replica». El veto de una respuesta oculta también las que cuelgan de ella, y al recargar el hilo
 * ya no llegan.
 */
export function HiloDeKudo({ kudoId, total }: Props) {
  const idPanel = useId();

  const [abierto, setAbierto] = useState(false);
  const [hilo, setHilo] = useState<readonly Replica[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);

    try {
      setHilo(await pedir<Replica[]>(`/kudos/${kudoId}/replicas`));
    } catch (causa) {
      setError(
        causa instanceof ErrorDeApi ? causa.message : 'No se pudieron cargar las respuestas.',
      );
    } finally {
      setCargando(false);
    }
  }, [kudoId]);

  async function alternar() {
    const quedaAbierto = !abierto;
    setAbierto(quedaAbierto);

    // Solo se consulta la primera vez que se abre.
    if (quedaAbierto && hilo === null && !cargando) {
      await cargar();
    }
  }

  const etiqueta =
    total > 0
      ? `${abierto ? 'Ocultar' : 'Ver'} ${String(total)} ${total === 1 ? 'respuesta' : 'respuestas'}`
      : 'Responder';

  return (
    <div className="hilo">
      <button
        type="button"
        className="enlace"
        aria-expanded={abierto}
        aria-controls={idPanel}
        onClick={() => {
          void alternar();
        }}
      >
        {abierto && total === 0 ? 'Ocultar' : etiqueta}
      </button>

      <div id={idPanel} hidden={!abierto}>
        {cargando && hilo === null && <p role="status">Cargando…</p>}

        {error !== null && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <FormularioDeRespuesta
          kudoId={kudoId}
          padreId={null}
          etiqueta="Responder al Kudo"
          alEnviar={cargar}
        />

        {hilo !== null && (
          <ul className="lista-replicas" aria-label="Respuestas">
            {hilo.map((replica) => (
              <li
                key={replica.id}
                className="replica"
                style={{
                  marginLeft: `${String(Math.min(replica.profundidad - 1, SANGRIA_MAXIMA))}rem`,
                }}
              >
                <TarjetaDeReplica replica={replica} kudoId={kudoId} alCambiar={cargar} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TarjetaDeReplica({
  replica,
  kudoId,
  alCambiar,
}: {
  replica: Replica;
  kudoId: string;
  alCambiar: () => Promise<void>;
}) {
  const [respondiendo, setRespondiendo] = useState(false);

  // Una réplica no tiene consulta propia: se vuelve a pedir el hilo y se busca esta.
  const leerResumen = useCallback(async () => {
    const hilo = await pedir<Replica[]>(`/kudos/${kudoId}/replicas`);
    const actual = hilo.find((r) => r.id === replica.id);

    return {
      promedio: actual?.promedioCalificacion ?? null,
      total: actual?.totalCalificaciones ?? 0,
    };
  }, [kudoId, replica.id]);

  return (
    <article className="tarjeta-replica">
      <p className="tarjeta-replica__autor">
        <strong>{replica.autorNombre}</strong>{' '}
        <time className="meta" dateTime={replica.publicadaEn}>
          {new Date(replica.publicadaEn).toLocaleDateString('es-CO', {
            day: 'numeric',
            month: 'short',
          })}
        </time>
      </p>

      <p className="tarjeta-kudo__contenido">{replica.contenido}</p>

      <Calificador
        contenidoId={replica.id}
        tipo="Replica"
        promedio={replica.promedioCalificacion}
        total={replica.totalCalificaciones}
        leerResumen={leerResumen}
      />

      <div className="acciones">
        <button type="button" className="secundario" onClick={() => setRespondiendo((v) => !v)}>
          {respondiendo ? 'Cancelar' : 'Responder'}
        </button>
      </div>

      {respondiendo && (
        <FormularioDeRespuesta
          kudoId={kudoId}
          padreId={replica.id}
          etiqueta={`Responder a ${replica.autorNombre}`}
          alEnviar={async () => {
            setRespondiendo(false);
            await alCambiar();
          }}
        />
      )}

      <AccionesDeModeracion
        tipo="Replica"
        contenidoId={replica.id}
        alVetar={() => void alCambiar()}
      />
    </article>
  );
}

function FormularioDeRespuesta({
  kudoId,
  padreId,
  etiqueta,
  alEnviar,
}: {
  kudoId: string;
  padreId: string | null;
  etiqueta: string;
  alEnviar: () => Promise<void>;
}) {
  const id = useId();
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);

    try {
      await pedir(`/kudos/${kudoId}/replicas`, {
        metodo: 'POST',
        cuerpo: { contenido: texto.trim(), replicaPadreId: padreId },
      });
      setTexto('');
      await alEnviar();
    } catch (causa) {
      setError(causa instanceof ErrorDeApi ? causa.message : 'No se pudo enviar tu respuesta.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={(e) => void enviar(e)} className="formulario-respuesta">
      <label htmlFor={id}>{etiqueta}</label>
      <textarea
        id={id}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={2}
        required
      />

      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" disabled={enviando || texto.trim() === ''}>
        {enviando ? 'Enviando…' : 'Enviar respuesta'}
      </button>
    </form>
  );
}
