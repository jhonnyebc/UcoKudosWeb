import { type FormEvent, useCallback, useEffect, useId, useState } from 'react';

import { ErrorDeApi, pedir } from '../api/cliente';
import type { FacultadAdmin, ProgramaAdmin } from '../api/tipos';

/**
 * Administración de la estructura académica: facultades y programas.
 *
 * Solo la administran el Administrador, el Rector y el Coordinador Académico, **y la regla la aplica
 * la API**: cualquier otro rol recibe el motivo exacto en lugar de la lista.
 *
 * Se **desactiva, no se borra**, como las categorías: las personas, los roles y los Kudos ya
 * existentes conservan su programa. Desactivar solo cierra lo nuevo: deja de ofrecerse al
 * registrarse y no admite vínculos nuevos. La pantalla lo dice antes de que alguien lo pulse.
 */
export function Estructura() {
  const [facultades, setFacultades] = useState<readonly FacultadAdmin[] | null>(null);
  const [errorDeCarga, setErrorDeCarga] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setFacultades(await pedir<FacultadAdmin[]>('/academico/estructura'));
      setErrorDeCarga(null);
    } catch (causa) {
      setFacultades(null);
      setErrorDeCarga(
        causa instanceof ErrorDeApi ? causa.message : 'No se pudo cargar la estructura.',
      );
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** Ejecuta una acción, muestra su error si falla y recarga la estructura si salió bien. */
  async function ejecutar(accion: () => Promise<unknown>, fallo: string): Promise<boolean> {
    setError(null);

    try {
      await accion();
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
        <h1>Estructura académica</h1>
        <p className="error" role="alert">
          {errorDeCarga}
        </p>
      </>
    );
  }

  if (facultades === null) {
    return (
      <>
        <h1>Estructura académica</h1>
        <p role="status">Cargando…</p>
      </>
    );
  }

  return (
    <>
      <h1>Estructura académica</h1>
      <p className="subtitulo">
        Facultades y programas. Desactivar no borra nada: las personas y los Kudos siguen donde
        están; solo deja de ofrecerse al registrarse.
      </p>

      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <section aria-labelledby="titulo-nueva-facultad">
        <h2 id="titulo-nueva-facultad">Nueva facultad</h2>
        <FormularioNombreYCodigo
          etiqueta="Crear facultad"
          limpiar
          alGuardar={(nombre, codigo) =>
            ejecutar(
              () => pedir('/academico/facultades', { metodo: 'POST', cuerpo: { nombre, codigo } }),
              'No se pudo crear la facultad.',
            )
          }
        />
      </section>

      <ul className="lista-categorias" aria-label="Facultades">
        {facultades.map((facultad) => (
          <li key={facultad.id}>
            <TarjetaDeFacultad facultad={facultad} ejecutar={ejecutar} />
          </li>
        ))}
      </ul>
    </>
  );
}

type Ejecutar = (accion: () => Promise<unknown>, fallo: string) => Promise<boolean>;

function TarjetaDeFacultad({
  facultad,
  ejecutar,
}: {
  facultad: FacultadAdmin;
  ejecutar: Ejecutar;
}) {
  const [editando, setEditando] = useState(false);
  const [agregando, setAgregando] = useState(false);

  return (
    <article className="tarjeta tarjeta-kudo">
      <h2>
        {facultad.nombre} <span className="meta">({facultad.codigo})</span>
      </h2>
      {!facultad.activa && <p className="meta">Desactivada: no se ofrece al registrarse.</p>}

      {editando ? (
        <FormularioNombreYCodigo
          etiqueta="Guardar"
          nombreInicial={facultad.nombre}
          codigoInicial={facultad.codigo}
          alGuardar={async (nombre, codigo) => {
            const ok = await ejecutar(
              () =>
                pedir(`/academico/facultades/${facultad.id}`, {
                  metodo: 'PUT',
                  cuerpo: { nombre, codigo },
                }),
              'No se pudo guardar la facultad.',
            );
            if (ok) {
              setEditando(false);
            }
            return ok;
          }}
          alCancelar={() => setEditando(false)}
        />
      ) : (
        <div className="acciones">
          <button type="button" className="secundario" onClick={() => setEditando(true)}>
            Editar
          </button>
          <button
            type="button"
            className="secundario"
            onClick={() => {
              void ejecutar(
                () =>
                  pedir(
                    `/academico/facultades/${facultad.id}/estado?activa=${String(!facultad.activa)}`,
                    {
                      metodo: 'POST',
                    },
                  ),
                'No se pudo cambiar el estado de la facultad.',
              );
            }}
          >
            {facultad.activa ? 'Desactivar' : 'Activar'}
          </button>
          <button type="button" className="secundario" onClick={() => setAgregando((v) => !v)}>
            {agregando ? 'Cancelar' : 'Agregar programa'}
          </button>
        </div>
      )}

      {agregando && (
        <FormularioNombreYCodigo
          etiqueta="Crear programa"
          limpiar
          alGuardar={async (nombre, codigo) => {
            const ok = await ejecutar(
              () =>
                pedir(`/academico/facultades/${facultad.id}/programas`, {
                  metodo: 'POST',
                  cuerpo: { nombre, codigo },
                }),
              'No se pudo crear el programa.',
            );
            if (ok) {
              setAgregando(false);
            }
            return ok;
          }}
        />
      )}

      {facultad.programas.length > 0 && (
        <ul className="lista-programas" aria-label={`Programas de ${facultad.nombre}`}>
          {facultad.programas.map((programa) => (
            <li key={programa.id}>
              <FilaDePrograma programa={programa} ejecutar={ejecutar} />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function FilaDePrograma({ programa, ejecutar }: { programa: ProgramaAdmin; ejecutar: Ejecutar }) {
  const [editando, setEditando] = useState(false);

  if (editando) {
    return (
      <FormularioNombreYCodigo
        etiqueta="Guardar"
        nombreInicial={programa.nombre}
        codigoInicial={programa.codigo}
        alGuardar={async (nombre, codigo) => {
          const ok = await ejecutar(
            () =>
              pedir(`/academico/programas/${programa.id}`, {
                metodo: 'PUT',
                cuerpo: { nombre, codigo },
              }),
            'No se pudo guardar el programa.',
          );
          if (ok) {
            setEditando(false);
          }
          return ok;
        }}
        alCancelar={() => setEditando(false)}
      />
    );
  }

  return (
    <div className="fila-programa">
      <span>
        <strong>{programa.nombre}</strong> <span className="meta">({programa.codigo})</span>
        {!programa.activo && <span className="meta"> · Desactivado</span>}
      </span>
      <span className="acciones">
        <button
          type="button"
          className="secundario"
          aria-label={`Editar ${programa.nombre}`}
          onClick={() => setEditando(true)}
        >
          Editar
        </button>
        <button
          type="button"
          className="secundario"
          aria-label={`${programa.activo ? 'Desactivar' : 'Activar'} ${programa.nombre}`}
          onClick={() => {
            void ejecutar(
              () =>
                pedir(
                  `/academico/programas/${programa.id}/estado?activo=${String(!programa.activo)}`,
                  {
                    metodo: 'POST',
                  },
                ),
              'No se pudo cambiar el estado del programa.',
            );
          }}
        >
          {programa.activo ? 'Desactivar' : 'Activar'}
        </button>
      </span>
    </div>
  );
}

function FormularioNombreYCodigo({
  etiqueta,
  nombreInicial = '',
  codigoInicial = '',
  limpiar = false,
  alGuardar,
  alCancelar,
}: {
  etiqueta: string;
  nombreInicial?: string;
  codigoInicial?: string;
  limpiar?: boolean;
  alGuardar: (nombre: string, codigo: string) => Promise<boolean>;
  alCancelar?: () => void;
}) {
  const id = useId();
  const [nombre, setNombre] = useState(nombreInicial);
  const [codigo, setCodigo] = useState(codigoInicial);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);

    const ok = await alGuardar(nombre.trim(), codigo.trim());

    setEnviando(false);
    if (ok && limpiar) {
      setNombre('');
      setCodigo('');
    }
  }

  return (
    <form onSubmit={(e) => void enviar(e)} className="formulario-respuesta">
      <label htmlFor={`${id}-nombre`}>Nombre</label>
      <input
        id={`${id}-nombre`}
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        required
      />

      <label htmlFor={`${id}-codigo`}>Código</label>
      <input
        id={`${id}-codigo`}
        value={codigo}
        onChange={(e) => setCodigo(e.target.value)}
        maxLength={20}
        required
      />

      <div className="acciones">
        <button type="submit" disabled={enviando || nombre.trim() === '' || codigo.trim() === ''}>
          {etiqueta}
        </button>
        {alCancelar !== undefined && (
          <button type="button" className="secundario" onClick={alCancelar}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
