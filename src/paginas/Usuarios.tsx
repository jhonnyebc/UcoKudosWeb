import { type FormEvent, useCallback, useEffect, useId, useState } from 'react';

import { ErrorDeApi, pedir } from '../api/cliente';
import type { Facultad, RolDelCatalogo, UsuarioAdministrado } from '../api/tipos';
import { rolesQueAsigna, useMiRol } from '../autenticacion/useMiRol';

/**
 * Administración de usuarios: desactivar y reactivar cuentas, y cambiar roles.
 *
 * Cada quien ve **a las personas que administra**, según la cadena del enunciado: el Coordinador de
 * Programa, a los estudiantes y docentes de sus programas; el de Facultad, a los coordinadores de
 * programa de su facultad; y así hasta el Administrador, que administra a administradores y rectores.
 * La regla la aplica la API; esta pantalla solo enseña lo que ella le da y esconde por cortesía lo
 * que no se podría hacer.
 *
 * **Desactivar no borra nada**: la cuenta pierde el acceso en la siguiente petición y conserva su
 * rol, sus Kudos y su historia. La pantalla lo dice antes de que alguien lo pulse, y pide un motivo
 * porque la acción queda en la auditoría.
 */
export function Usuarios() {
  const [busqueda, setBusqueda] = useState('');
  const [usuarios, setUsuarios] = useState<readonly UsuarioAdministrado[] | null>(null);
  const [errorDeCarga, setErrorDeCarga] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const idBuscador = useId();

  const cargar = useCallback(async () => {
    try {
      const consulta =
        busqueda.trim() === '' ? '' : `?busqueda=${encodeURIComponent(busqueda.trim())}`;
      setUsuarios(await pedir<UsuarioAdministrado[]>(`/usuarios${consulta}`));
      setErrorDeCarga(null);
    } catch (causa) {
      setUsuarios(null);
      setErrorDeCarga(
        causa instanceof ErrorDeApi ? causa.message : 'No se pudieron cargar los usuarios.',
      );
    }
  }, [busqueda]);

  useEffect(() => {
    // Una pequeña espera: sin ella, escribir un nombre serían una petición por letra.
    const temporizador = setTimeout(() => {
      void cargar();
    }, 250);

    return () => clearTimeout(temporizador);
  }, [cargar]);

  async function ejecutar(
    accion: () => Promise<unknown>,
    exito: string,
    fallo: string,
  ): Promise<boolean> {
    setError(null);
    setAviso(null);

    try {
      await accion();
      setAviso(exito);
      await cargar();
      return true;
    } catch (causa) {
      setError(causa instanceof ErrorDeApi ? causa.message : fallo);
      return false;
    }
  }

  if (errorDeCarga !== null) {
    return (
      <>
        <h1>Usuarios</h1>
        <p className="error" role="alert">
          {errorDeCarga}
        </p>
      </>
    );
  }

  return (
    <>
      <h1>Usuarios</h1>
      <p className="subtitulo">
        Las personas a tu cargo. Desactivar una cuenta no borra nada: pierde el acceso y se puede
        reactivar.
      </p>

      <label htmlFor={idBuscador}>Buscar por nombre</label>
      <input
        id={idBuscador}
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        autoComplete="off"
      />

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

      {usuarios === null ? (
        <p role="status">Cargando…</p>
      ) : usuarios.length === 0 ? (
        <p>No hay personas a tu cargo{busqueda.trim() === '' ? '' : ' con ese nombre'}.</p>
      ) : (
        <ul className="lista-kudos" aria-label="Usuarios a tu cargo">
          {usuarios.map((u) => (
            <li key={u.id}>
              <TarjetaDeUsuario usuario={u} ejecutar={ejecutar} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

type Ejecutar = (accion: () => Promise<unknown>, exito: string, fallo: string) => Promise<boolean>;

function TarjetaDeUsuario({
  usuario,
  ejecutar,
}: {
  usuario: UsuarioAdministrado;
  ejecutar: Ejecutar;
}) {
  const [accion, setAccion] = useState<'desactivar' | 'rol' | null>(null);
  const inactiva = usuario.estadoCuenta === 'Inactiva';

  return (
    <article className="tarjeta tarjeta-kudo">
      <h2>{usuario.nombreCompleto}</h2>
      <p className="categoria">{usuario.rol}</p>
      <p>{usuario.correoInstitucional}</p>
      <p className="meta">Cuenta: {usuario.estadoCuenta}</p>

      {accion === null && (
        <div className="acciones">
          {inactiva ? (
            <button
              type="button"
              onClick={() => {
                void ejecutar(
                  () => pedir(`/usuarios/${usuario.id}/reactivar`, { metodo: 'POST' }),
                  `Reactivaste la cuenta de ${usuario.nombreCompleto}.`,
                  'No se pudo reactivar la cuenta.',
                );
              }}
            >
              Reactivar
            </button>
          ) : (
            <button type="button" className="peligro" onClick={() => setAccion('desactivar')}>
              Desactivar…
            </button>
          )}
          <button type="button" className="secundario" onClick={() => setAccion('rol')}>
            Cambiar rol…
          </button>
        </div>
      )}

      {accion === 'desactivar' && (
        <FormularioDeMotivo
          etiqueta="Motivo de la desactivación"
          aviso="Pierde el acceso en su siguiente petición. No se borra nada y se puede reactivar."
          boton="Confirmar desactivación"
          alCancelar={() => setAccion(null)}
          alEnviar={async (motivo) => {
            const ok = await ejecutar(
              () =>
                pedir(`/usuarios/${usuario.id}/desactivar`, { metodo: 'POST', cuerpo: { motivo } }),
              `Desactivaste la cuenta de ${usuario.nombreCompleto}.`,
              'No se pudo desactivar la cuenta.',
            );
            if (ok) {
              setAccion(null);
            }
          }}
        />
      )}

      {accion === 'rol' && (
        <FormularioDeRol
          usuario={usuario}
          alCancelar={() => setAccion(null)}
          alEnviar={async (cuerpo) => {
            const ok = await ejecutar(
              () => pedir(`/usuarios/${usuario.id}/rol`, { metodo: 'POST', cuerpo }),
              `Cambiaste el rol de ${usuario.nombreCompleto}.`,
              'No se pudo cambiar el rol.',
            );
            if (ok) {
              setAccion(null);
            }
          }}
        />
      )}
    </article>
  );
}

function FormularioDeMotivo({
  etiqueta,
  aviso,
  boton,
  alEnviar,
  alCancelar,
}: {
  etiqueta: string;
  aviso: string;
  boton: string;
  alEnviar: (motivo: string) => Promise<void>;
  alCancelar: () => void;
}) {
  const id = useId();
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    await alEnviar(motivo.trim());
    setEnviando(false);
  }

  return (
    <form onSubmit={(e) => void enviar(e)} className="formulario-respuesta">
      <label htmlFor={id}>{etiqueta}</label>
      <input id={id} value={motivo} onChange={(e) => setMotivo(e.target.value)} required />
      <p className="meta">{aviso}</p>
      <div className="acciones">
        <button type="submit" className="peligro" disabled={enviando || motivo.trim() === ''}>
          {boton}
        </button>
        <button type="button" className="secundario" onClick={alCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

interface CuerpoDeRol {
  readonly rolId: number;
  readonly facultadId: string | null;
  readonly programaId: string | null;
  readonly motivo: string;
}

function FormularioDeRol({
  usuario,
  alEnviar,
  alCancelar,
}: {
  usuario: UsuarioAdministrado;
  alEnviar: (cuerpo: CuerpoDeRol) => Promise<void>;
  alCancelar: () => void;
}) {
  const id = useId();
  const rolDeQuienAdministra = useMiRol();
  const permitidos = rolesQueAsigna(rolDeQuienAdministra);

  const [catalogo, setCatalogo] = useState<readonly RolDelCatalogo[]>([]);
  const [facultades, setFacultades] = useState<readonly Facultad[]>([]);
  const [rolId, setRolId] = useState('');
  const [facultadId, setFacultadId] = useState('');
  const [programaId, setProgramaId] = useState('');
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let cancelado = false;

    Promise.all([
      pedir<RolDelCatalogo[]>('/identidad/roles'),
      pedir<Facultad[]>('/identidad/estructura'),
    ])
      .then(([roles, estructura]) => {
        if (!cancelado) {
          setCatalogo(roles);
          setFacultades(estructura);
        }
      })
      .catch(() => {
        // Sin el catálogo no hay qué elegir; el formulario queda vacío en lugar de romper la pantalla.
      });

    return () => {
      cancelado = true;
    };
  }, []);

  const opciones = catalogo.filter(
    (r) => permitidos.includes(r.nombre) && r.nombre !== usuario.rol,
  );
  const elegido = catalogo.find((r) => String(r.id) === rolId);
  const pideFacultad = elegido?.ambito === 'Facultad' || elegido?.ambito === 'Programa';
  const pidePrograma = elegido?.ambito === 'Programa';
  const programas = facultades.find((f) => f.id === facultadId)?.programas ?? [];

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    await alEnviar({
      rolId: Number(rolId),
      facultadId: pideFacultad && facultadId !== '' ? facultadId : null,
      programaId: pidePrograma && programaId !== '' ? programaId : null,
      motivo: motivo.trim(),
    });
    setEnviando(false);
  }

  return (
    <form onSubmit={(e) => void enviar(e)} className="formulario-respuesta">
      <label htmlFor={`${id}-rol`}>Nuevo rol</label>
      <select id={`${id}-rol`} value={rolId} onChange={(e) => setRolId(e.target.value)} required>
        <option value="">Elige un rol</option>
        {opciones.map((r) => (
          <option key={r.id} value={r.id}>
            {r.nombre}
          </option>
        ))}
      </select>

      {pideFacultad && (
        <>
          <label htmlFor={`${id}-facultad`}>Facultad</label>
          <select
            id={`${id}-facultad`}
            value={facultadId}
            onChange={(e) => {
              setFacultadId(e.target.value);
              setProgramaId('');
            }}
            required
          >
            <option value="">Elige una facultad</option>
            {facultades.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nombre}
              </option>
            ))}
          </select>
        </>
      )}

      {pidePrograma && (
        <>
          <label htmlFor={`${id}-programa`}>Programa</label>
          <select
            id={`${id}-programa`}
            value={programaId}
            onChange={(e) => setProgramaId(e.target.value)}
            disabled={facultadId === ''}
            required
          >
            <option value="">Elige un programa</option>
            {programas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </>
      )}

      <label htmlFor={`${id}-motivo`}>Motivo del cambio</label>
      <input
        id={`${id}-motivo`}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        required
      />
      <p className="meta">
        El rol actual se revoca y queda en la historia. Solo puedes asignar los roles que tú mismo
        apruebas.
      </p>

      <div className="acciones">
        <button type="submit" disabled={enviando || rolId === '' || motivo.trim() === ''}>
          Cambiar rol
        </button>
        <button type="button" className="secundario" onClick={alCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
