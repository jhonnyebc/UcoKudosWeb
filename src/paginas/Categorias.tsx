import { useCallback, useEffect, useId, useState } from 'react';

import { ErrorDeApi, pedir } from '../api/cliente';
import type { Categoria } from '../api/tipos';

/**
 * Administración de categorías (RF-06).
 *
 * Solo la pueden usar el Administrador, el Rector y el Coordinador Académico, y **la regla la
 * aplica el servidor, no esta pantalla**: cualquiera puede abrirla, y quien no tenga permiso recibe
 * el motivo exacto que da la API —«El rol Docente no administra categorías»— en lugar de un formulario
 * que fallaría al enviarlo. Esconder el botón no es una medida de seguridad; es solo cortesía.
 *
 * Las categorías se **desactivan, no se borran**: los Kudos ya publicados conservan su categoría, y
 * borrarla dejaría reconocimientos sin clasificar.
 */
export function Categorias() {
  const [categorias, setCategorias] = useState<readonly Categoria[] | null>(null);
  const [errorDeCarga, setErrorDeCarga] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setCategorias(await pedir<Categoria[]>('/categorias/todas'));
      setErrorDeCarga(null);
    } catch (causa) {
      // Sin permiso, o sin red: no hay lista que enseñar y tampoco formulario que ofrecer.
      setCategorias(null);
      setErrorDeCarga(
        causa instanceof ErrorDeApi ? causa.message : 'No se pudieron cargar las categorías.',
      );
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** Ejecuta una acción, muestra su error si falla y recarga la lista si salió bien. */
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

  const crear = (nombre: string, descripcion: string) =>
    ejecutar(
      () => pedir('/categorias', { metodo: 'POST', cuerpo: { nombre, descripcion } }),
      'No se pudo crear la categoría.',
    );

  async function guardarEdicion(id: string, nombre: string, descripcion: string) {
    const guardada = await ejecutar(
      () => pedir(`/categorias/${id}`, { metodo: 'PUT', cuerpo: { nombre, descripcion } }),
      'No se pudo guardar la categoría.',
    );

    if (guardada) {
      setEditandoId(null);
    }

    return guardada;
  }

  const cambiarEstado = (categoria: Categoria) =>
    ejecutar(
      () =>
        pedir(`/categorias/${categoria.id}/estado?activa=${String(!categoria.activa)}`, {
          metodo: 'POST',
        }),
      'No se pudo cambiar el estado de la categoría.',
    );

  if (errorDeCarga !== null) {
    return (
      <>
        <h1>Categorías</h1>
        <p className="error" role="alert">
          {errorDeCarga}
        </p>
      </>
    );
  }

  if (categorias === null) {
    return (
      <>
        <h1>Categorías</h1>
        <p role="status">Cargando…</p>
      </>
    );
  }

  return (
    <>
      <h1>Categorías</h1>

      <section aria-labelledby="titulo-nueva">
        <h2 id="titulo-nueva">Nueva categoría</h2>
        <FormularioDeCategoria
          etiquetaDelBoton="Crear categoría"
          alGuardar={crear}
          limpiarAlGuardar
        />
      </section>

      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <section aria-labelledby="titulo-lista">
        <h2 id="titulo-lista">
          Todas las categorías <span className="meta">({categorias.length})</span>
        </h2>

        <ul className="lista-categorias">
          {categorias.map((categoria) => (
            <li key={categoria.id} className="tarjeta">
              {editandoId === categoria.id ? (
                <FormularioDeCategoria
                  inicial={categoria}
                  etiquetaDelBoton="Guardar cambios"
                  alGuardar={(nombre, descripcion) =>
                    guardarEdicion(categoria.id, nombre, descripcion)
                  }
                  alCancelar={() => setEditandoId(null)}
                />
              ) : (
                <>
                  <h3>
                    {categoria.nombre}{' '}
                    {/* El estado se dice con texto y no solo con color: no todos lo distinguen. */}
                    <span className="meta">({categoria.activa ? 'activa' : 'inactiva'})</span>
                  </h3>

                  {categoria.descripcion !== '' && <p>{categoria.descripcion}</p>}

                  <p className="acciones">
                    <button
                      type="button"
                      className="enlace"
                      onClick={() => {
                        setError(null);
                        setEditandoId(categoria.id);
                      }}
                    >
                      Editar<span className="solo-lectores"> {categoria.nombre}</span>
                    </button>{' '}
                    <button
                      type="button"
                      className="enlace"
                      onClick={() => {
                        void cambiarEstado(categoria);
                      }}
                    >
                      {categoria.activa ? 'Desactivar' : 'Activar'}
                      <span className="solo-lectores"> {categoria.nombre}</span>
                    </button>
                  </p>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

interface PropsFormulario {
  readonly inicial?: Categoria;
  readonly etiquetaDelBoton: string;
  /** Devuelve `true` si se guardó. Si falla, el formulario conserva lo escrito. */
  readonly alGuardar: (nombre: string, descripcion: string) => Promise<boolean>;
  readonly alCancelar?: () => void;
  readonly limpiarAlGuardar?: boolean;
}

/**
 * El formulario de nombre y descripción, compartido por crear y editar.
 *
 * Si guardar falla, **no se vacía**: perder lo que alguien acaba de escribir por un error de red o
 * por un nombre repetido obliga a escribirlo otra vez, y eso es lo que hace que se abandone.
 */
function FormularioDeCategoria({
  inicial,
  etiquetaDelBoton,
  alGuardar,
  alCancelar,
  limpiarAlGuardar = false,
}: PropsFormulario) {
  const idNombre = useId();
  const idDescripcion = useId();

  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? '');
  const [guardando, setGuardando] = useState(false);

  const nombreLimpio = nombre.trim();

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();

    if (nombreLimpio === '' || guardando) {
      return;
    }

    setGuardando(true);
    const guardado = await alGuardar(nombreLimpio, descripcion.trim());
    setGuardando(false);

    if (guardado && limpiarAlGuardar) {
      setNombre('');
      setDescripcion('');
    }
  }

  return (
    <form
      onSubmit={(evento) => {
        void enviar(evento);
      }}
      noValidate
    >
      <p>
        <label htmlFor={idNombre}>Nombre</label>
        <input
          id={idNombre}
          type="text"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          autoComplete="off"
          required
        />
      </p>

      <p>
        <label htmlFor={idDescripcion}>Descripción</label>
        <input
          id={idDescripcion}
          type="text"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          autoComplete="off"
        />
      </p>

      <p>
        <button type="submit" disabled={nombreLimpio === '' || guardando}>
          {guardando ? 'Guardando…' : etiquetaDelBoton}
        </button>

        {alCancelar !== undefined && (
          <>
            {' '}
            <button type="button" className="enlace" onClick={alCancelar}>
              Cancelar
            </button>
          </>
        )}
      </p>
    </form>
  );
}
