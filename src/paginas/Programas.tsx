import { type FormEvent, useCallback, useEffect, useId, useState } from 'react';

import { ErrorDeApi, pedir } from '../api/cliente';
import type { Facultad, PersonaBuscada, ProgramasDePersona } from '../api/tipos';
import { apruebaSolicitudes, useMiRol } from '../autenticacion/useMiRol';
import { BuscadorDePersonas } from '../componentes/BuscadorDePersonas';

/**
 * Los programas de cada persona (RF-05, Gestión Académica).
 *
 * El enunciado pide poder conocer qué programas estudia un estudiante, en cuáles enseña un docente,
 * qué programa acompaña un Coordinador de Programa y qué facultad acompaña uno de Facultad. Todos
 * ven **los suyos**; los coordinadores, además, consultan y vinculan a las personas de su ámbito.
 * La regla de alcance la aplica la API —un coordinador no ve a las personas de otro programa—: esta
 * pantalla solo enseña lo que la API le da.
 */
export function Programas() {
  const rol = useMiRol();

  return (
    <>
      <h1>Programas</h1>
      <p className="subtitulo">Los programas en los que estás, y los de las personas a tu cargo.</p>

      <section aria-labelledby="titulo-mios">
        <h2 id="titulo-mios">Mis programas</h2>
        <FichaDePrograma
          ruta="/academico/mis-programas"
          editable={false}
          alCambiar={() => undefined}
        />
      </section>

      {apruebaSolicitudes(rol) && <ConsultaDePersona />}
    </>
  );
}

function ConsultaDePersona() {
  const id = useId();
  const [persona, setPersona] = useState<PersonaBuscada | null>(null);

  return (
    <section aria-labelledby={`${id}-titulo`}>
      <h2 id={`${id}-titulo`}>Consultar o vincular a una persona</h2>

      <label htmlFor={`${id}-buscador`}>Persona</label>
      <BuscadorDePersonas id={`${id}-buscador`} valor={persona} alElegir={setPersona} />

      {persona !== null && (
        <FichaDePrograma
          key={persona.id}
          ruta={`/academico/personas/${persona.id}/programas`}
          personaId={persona.id}
          editable
          alCambiar={() => undefined}
        />
      )}
    </section>
  );
}

function FichaDePrograma({
  ruta,
  personaId,
  editable,
  alCambiar,
}: {
  ruta: string;
  personaId?: string;
  editable: boolean;
  alCambiar: () => void;
}) {
  const [ficha, setFicha] = useState<ProgramasDePersona | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setFicha(await pedir<ProgramasDePersona>(ruta));
      setError(null);
    } catch (causa) {
      setFicha(null);
      setError(
        causa instanceof ErrorDeApi ? causa.message : 'No se pudieron cargar los programas.',
      );
    }
  }, [ruta]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function quitar(programaId: string, relacion: string) {
    setAviso(null);

    try {
      const tipo = relacion === 'Matrícula' ? 'Matricula' : 'Docencia';
      await pedir(`/academico/personas/${personaId ?? ''}/vinculos/${programaId}/${tipo}`, {
        metodo: 'DELETE',
      });
      setAviso('Quitaste el vínculo.');
      await cargar();
      alCambiar();
    } catch (causa) {
      setError(causa instanceof ErrorDeApi ? causa.message : 'No se pudo quitar el vínculo.');
    }
  }

  if (error !== null) {
    return (
      <p className="error" role="alert">
        {error}
      </p>
    );
  }

  if (ficha === null) {
    return <p role="status">Cargando…</p>;
  }

  const puedeVincular = editable && (ficha.rol === 'Estudiante' || ficha.rol === 'Docente');

  return (
    <article className="tarjeta tarjeta-kudo">
      <h3>{ficha.nombreCompleto}</h3>
      <p className="categoria">{ficha.rol}</p>

      {ficha.facultadAcompanada !== null && (
        <p>
          Acompaña la facultad <strong>{ficha.facultadAcompanada}</strong>.
        </p>
      )}

      {ficha.programas.length === 0 ? (
        ficha.facultadAcompanada === null && <p>No tiene programas registrados.</p>
      ) : (
        <ul className="lista-programas" aria-label={`Programas de ${ficha.nombreCompleto}`}>
          {ficha.programas.map((p) => (
            <li key={`${p.programaId}-${p.relacion}`}>
              <strong>{p.programaNombre}</strong> <span className="meta">({p.programaCodigo})</span>
              <span className="meta">
                {' · '}
                {p.facultadNombre}
                {' · '}
                {p.relacion}
              </span>
              {editable && p.relacion !== 'Principal' && (
                <button
                  type="button"
                  className="secundario"
                  aria-label={`Quitar el vínculo con ${p.programaNombre}`}
                  onClick={() => {
                    void quitar(p.programaId, p.relacion);
                  }}
                >
                  Quitar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {aviso !== null && (
        <p className="exito" role="status">
          {aviso}
        </p>
      )}

      {puedeVincular && personaId !== undefined && (
        <FormularioDeVinculo
          personaId={personaId}
          rol={ficha.rol}
          alVincular={async () => {
            setAviso('Vinculaste a la persona con el programa.');
            await cargar();
            alCambiar();
          }}
        />
      )}
    </article>
  );
}

function FormularioDeVinculo({
  personaId,
  rol,
  alVincular,
}: {
  personaId: string;
  rol: string;
  alVincular: () => Promise<void>;
}) {
  const id = useId();
  const [facultades, setFacultades] = useState<readonly Facultad[]>([]);
  const [programaId, setProgramaId] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    pedir<Facultad[]>('/identidad/estructura')
      .then((f) => {
        if (!cancelado) {
          setFacultades(f);
        }
      })
      .catch(() => {
        // Sin la lista no se puede vincular, pero consultar sigue funcionando.
      });

    return () => {
      cancelado = true;
    };
  }, []);

  // Un estudiante se matricula y un docente enseña: el tipo lo decide el rol, no se pregunta.
  const tipo = rol === 'Docente' ? 'Docencia' : 'Matricula';

  async function vincular(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);

    try {
      await pedir(`/academico/personas/${personaId}/vinculos`, {
        metodo: 'POST',
        cuerpo: { programaId, tipo },
      });
      setProgramaId('');
      await alVincular();
    } catch (causa) {
      setError(causa instanceof ErrorDeApi ? causa.message : 'No se pudo vincular.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={(e) => void vincular(e)} className="formulario-respuesta">
      <label htmlFor={id}>
        {rol === 'Docente' ? 'Enseña en el programa' : 'Cursa también el programa'}
      </label>
      <select id={id} value={programaId} onChange={(e) => setProgramaId(e.target.value)} required>
        <option value="">Elige un programa</option>
        {facultades.map((f) => (
          <optgroup key={f.id} label={f.nombre}>
            {f.programas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" disabled={enviando || programaId === ''}>
        {enviando ? 'Vinculando…' : 'Vincular'}
      </button>
    </form>
  );
}
