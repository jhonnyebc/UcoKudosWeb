import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { Categorias } from './Categorias';

/**
 * El título de una categoría, por su rol de encabezado. No se busca por texto: el nombre aparece
 * también en los sufijos para lectores de pantalla de los botones de cada fila («Editar Empatía»),
 * que existen a propósito para que se distingan entre sí.
 */
const titulo = (nombre: string) =>
  screen.findByRole('heading', { level: 3, name: new RegExp(`^${nombre}`) });

const CATEGORIAS = [
  { id: 'c1', nombre: 'Empatía', descripcion: 'Ponerse en el lugar del otro.', activa: true },
  { id: 'c2', nombre: 'Innovación', descripcion: '', activa: false },
];

interface Llamada {
  readonly url: string;
  readonly metodo: string;
  readonly cuerpo: unknown;
}

/**
 * Una API de mentira con estado: la lista que devuelve cambia cuando se crea, edita o cambia el
 * estado de algo, como lo haría la real. Sin esto, comprobar «se recarga la lista tras crear»
 * exigiría adivinar qué devolver en cada vuelta.
 */
function fingirApi(opciones: { rechazoCon?: { estado: number; detalle: string } } = {}) {
  let lista = CATEGORIAS.map((c) => ({ ...c }));
  const llamadas: Llamada[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const metodo = init?.method ?? 'GET';
      const cuerpo =
        typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
      llamadas.push({ url, metodo, cuerpo });

      if (opciones.rechazoCon !== undefined) {
        return Promise.resolve(
          new Response(JSON.stringify({ detail: opciones.rechazoCon.detalle }), {
            status: opciones.rechazoCon.estado,
          }),
        );
      }

      if (url === '/api/categorias/todas') {
        return Promise.resolve(new Response(JSON.stringify(lista)));
      }

      if (url === '/api/categorias' && metodo === 'POST') {
        const nueva = cuerpo as { nombre: string; descripcion: string };
        lista = [...lista, { id: 'nueva', activa: true, ...nueva }];
        return Promise.resolve(new Response(JSON.stringify(lista.at(-1)), { status: 201 }));
      }

      const edicion = /^\/api\/categorias\/([^/?]+)$/.exec(url);
      if (edicion !== null && metodo === 'PUT') {
        const datos = cuerpo as { nombre: string; descripcion: string };
        lista = lista.map((c) => (c.id === edicion[1] ? { ...c, ...datos } : c));
        return Promise.resolve(new Response(null, { status: 204 }));
      }

      const estado = /^\/api\/categorias\/([^/]+)\/estado\?activa=(true|false)$/.exec(url);
      if (estado !== null && metodo === 'POST') {
        lista = lista.map((c) => (c.id === estado[1] ? { ...c, activa: estado[2] === 'true' } : c));
        return Promise.resolve(new Response(null, { status: 204 }));
      }

      throw new Error(`Llamada inesperada: ${metodo} ${url}`);
    }),
  );

  return llamadas;
}

describe('Categorias', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lista todas las categorías, y dice con texto cuáles están inactivas', async () => {
    fingirApi();

    render(<Categorias />);

    expect(await titulo('Empatía')).toBeDefined();
    expect(await titulo('Innovación')).toBeDefined();
    expect(screen.getByText('(activa)')).toBeDefined();
    expect(screen.getByText('(inactiva)')).toBeDefined();
  });

  /**
   * La regla la aplica el servidor. Quien no tiene permiso ve el motivo exacto que da la API y
   * **ningún formulario**, que fallaría al enviarlo.
   */
  it('a quien no tiene permiso le enseña el motivo y ningún formulario', async () => {
    fingirApi({ rechazoCon: { estado: 403, detalle: 'El rol Docente no administra categorías.' } });

    render(<Categorias />);

    expect(await screen.findByText('El rol Docente no administra categorías.')).toBeDefined();
    expect(screen.queryByRole('button', { name: /crear categoría/i })).toBeNull();
  });

  it('crea una categoría y recarga la lista', async () => {
    const llamadas = fingirApi();

    render(<Categorias />);
    await titulo('Empatía');

    await userEvent.type(screen.getByLabelText('Nombre'), 'Mentoría');
    await userEvent.type(screen.getAllByLabelText('Descripción')[0]!, 'Acompañar a otros.');
    await userEvent.click(screen.getByRole('button', { name: /crear categoría/i }));

    expect(await titulo('Mentoría')).toBeDefined();

    const creacion = llamadas.find((l) => l.metodo === 'POST');
    expect(creacion?.url).toBe('/api/categorias');
    expect(creacion?.cuerpo).toEqual({ nombre: 'Mentoría', descripcion: 'Acompañar a otros.' });
  });

  it('vacía el formulario de creación cuando se guardó', async () => {
    fingirApi();

    render(<Categorias />);
    await titulo('Empatía');

    const campo = screen.getByLabelText<HTMLInputElement>('Nombre');
    await userEvent.type(campo, 'Mentoría');
    await userEvent.click(screen.getByRole('button', { name: /crear categoría/i }));
    await titulo('Mentoría');

    await waitFor(() => {
      expect(campo.value).toBe('');
    });
  });

  it('no deja crear una categoría sin nombre', async () => {
    fingirApi();

    render(<Categorias />);
    await titulo('Empatía');

    const boton = screen.getByRole<HTMLButtonElement>('button', { name: /crear categoría/i });
    expect(boton.disabled).toBe(true);

    await userEvent.type(screen.getByLabelText('Nombre'), '   ');
    expect(boton.disabled).toBe(true);
  });

  /**
   * Perder lo escrito por un nombre repetido obliga a escribirlo otra vez, y eso es lo que hace
   * que se abandone un formulario.
   */
  it('si el servidor rechaza el nombre, muestra el motivo y conserva lo escrito', async () => {
    let rechazar = false;
    fingirApi();
    const original = globalThis.fetch;

    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) =>
        rechazar && init?.method === 'POST'
          ? Promise.resolve(
              new Response(
                JSON.stringify({ detail: 'Ya existe una categoría con el nombre Empatía.' }),
                {
                  status: 400,
                },
              ),
            )
          : original(url, init),
      ),
    );

    render(<Categorias />);
    await titulo('Innovación');

    rechazar = true;
    const campo = screen.getByLabelText<HTMLInputElement>('Nombre');
    await userEvent.type(campo, 'Empatía');
    await userEvent.click(screen.getByRole('button', { name: /crear categoría/i }));

    expect(await screen.findByText('Ya existe una categoría con el nombre Empatía.')).toBeDefined();
    expect(campo.value).toBe('Empatía');
  });

  it('desactiva una categoría activa con la acción de estado', async () => {
    const llamadas = fingirApi();

    render(<Categorias />);
    await titulo('Empatía');

    await userEvent.click(screen.getByRole('button', { name: /desactivar empatía/i }));

    await waitFor(() => {
      expect(screen.getAllByText('(inactiva)')).toHaveLength(2);
    });

    expect(
      llamadas.some(
        (l) => l.url === '/api/categorias/c1/estado?activa=false' && l.metodo === 'POST',
      ),
    ).toBe(true);
  });

  it('activa una categoría inactiva', async () => {
    const llamadas = fingirApi();

    render(<Categorias />);
    await titulo('Innovación');

    await userEvent.click(screen.getByRole('button', { name: /^activar innovación/i }));

    await waitFor(() => {
      expect(screen.getAllByText('(activa)')).toHaveLength(2);
    });

    expect(llamadas.some((l) => l.url === '/api/categorias/c2/estado?activa=true')).toBe(true);
  });

  it('edita el nombre y la descripción de una categoría', async () => {
    const llamadas = fingirApi();

    render(<Categorias />);
    await titulo('Empatía');

    await userEvent.click(screen.getByRole('button', { name: /editar empatía/i }));

    const nombre = screen.getAllByLabelText<HTMLInputElement>('Nombre')[1]!;
    await userEvent.clear(nombre);
    await userEvent.type(nombre, 'Empatía activa');
    await userEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));

    expect(await titulo('Empatía activa')).toBeDefined();

    const edicion = llamadas.find((l) => l.metodo === 'PUT');
    expect(edicion?.url).toBe('/api/categorias/c1');
    expect(edicion?.cuerpo).toEqual({
      nombre: 'Empatía activa',
      descripcion: 'Ponerse en el lugar del otro.',
    });
  });

  it('cancelar la edición no envía nada', async () => {
    const llamadas = fingirApi();

    render(<Categorias />);
    await titulo('Empatía');

    await userEvent.click(screen.getByRole('button', { name: /editar empatía/i }));
    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }));

    expect(screen.queryByRole('button', { name: /guardar cambios/i })).toBeNull();
    expect(llamadas.some((l) => l.metodo === 'PUT')).toBe(false);
  });

  it('no tiene problemas de accesibilidad detectables en la estructura', async () => {
    fingirApi();

    const { container } = render(<Categorias />);
    await titulo('Empatía');

    const resultado = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    });

    expect(resultado).toHaveNoViolations();
  });
});
