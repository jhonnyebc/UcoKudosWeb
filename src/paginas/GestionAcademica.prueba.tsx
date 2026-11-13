import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { guardarSesion, reiniciarParaPruebas } from '../autenticacion/almacenDeSesion';
import { olvidarRoles } from '../autenticacion/useMiRol';
import { Estructura } from './Estructura';
import { Programas } from './Programas';

interface Llamada {
  readonly url: string;
  readonly metodo: string;
  readonly cuerpo: unknown;
}

const json = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado });

function fingirRed(rol: string, rutas: Array<[RegExp, () => Response]>): Llamada[] {
  guardarSesion({
    token: 'token-de-prueba',
    expiraEn: Date.now() + 3_600_000,
    nombre: 'Persona de prueba',
    personaId: `persona-${rol}`,
  });

  const llamadas: Llamada[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const metodo = init?.method ?? 'GET';
      llamadas.push({
        url,
        metodo,
        cuerpo: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
      });

      if (url.includes('/identidad/yo')) {
        return Promise.resolve(json({ rol }));
      }

      const ruta = rutas.find(([patron]) => patron.test(`${metodo} ${url}`));
      if (ruta === undefined) {
        throw new Error(`Llamada inesperada: ${metodo} ${url}`);
      }

      return Promise.resolve(ruta[1]());
    }),
  );

  return llamadas;
}

afterEach(() => {
  vi.unstubAllGlobals();
  reiniciarParaPruebas();
  olvidarRoles();
});

const PROGRAMA = {
  programaId: 'p1',
  programaNombre: 'Ingeniería de Sistemas',
  programaCodigo: 'ISIS',
  facultadId: 'f1',
  facultadNombre: 'Ingenierías',
  relacion: 'Principal',
};

const FICHA_PROPIA = {
  personaId: 'yo',
  nombreCompleto: 'Carlos Mejía',
  rol: 'Estudiante',
  facultadAcompanada: null,
  programas: [PROGRAMA],
};

const ESTRUCTURA_PUBLICA = [
  {
    id: 'f1',
    nombre: 'Ingenierías',
    codigo: 'ING',
    programas: [{ id: 'p1', nombre: 'Ingeniería de Sistemas', codigo: 'ISIS' }],
  },
  {
    id: 'f2',
    nombre: 'Ciencias',
    codigo: 'CIE',
    programas: [{ id: 'p2', nombre: 'Biología', codigo: 'BIO' }],
  },
];

describe('Programas', () => {
  it('enseña los programas propios con su facultad y el motivo de cada uno', async () => {
    fingirRed('Estudiante', [[/GET .*\/academico\/mis-programas/, () => json(FICHA_PROPIA)]]);

    render(<Programas />);

    expect(await screen.findByText('Ingeniería de Sistemas')).toBeDefined();
    expect(screen.getByText(/Ingenierías/)).toBeDefined();
    expect(screen.getByText(/Principal/)).toBeDefined();
  });

  it('un estudiante no ve la consulta de otras personas', async () => {
    const llamadas = fingirRed('Estudiante', [
      [/GET .*\/academico\/mis-programas/, () => json(FICHA_PROPIA)],
    ]);

    render(<Programas />);
    await screen.findByText('Ingeniería de Sistemas');
    await waitFor(() => {
      expect(llamadas.some((l) => l.url.includes('/identidad/yo'))).toBe(true);
    });
    await new Promise((r) => setTimeout(r, 20));

    expect(screen.queryByText('Consultar o vincular a una persona')).toBeNull();
  });

  it('un Coordinador de Facultad ve la facultad que acompaña', async () => {
    fingirRed('Coordinador de Facultad', [
      [
        /GET .*\/academico\/mis-programas/,
        () =>
          json({
            ...FICHA_PROPIA,
            rol: 'Coordinador de Facultad',
            facultadAcompanada: 'Ingenierías',
            programas: [],
          }),
      ],
    ]);

    render(<Programas />);

    expect(await screen.findByText('Ingenierías')).toBeDefined();
    expect(screen.getByText(/Acompaña la facultad/)).toBeDefined();
  });

  it('dice cuando una persona no tiene programas registrados', async () => {
    fingirRed('Estudiante', [
      [/GET .*\/academico\/mis-programas/, () => json({ ...FICHA_PROPIA, programas: [] })],
    ]);

    render(<Programas />);

    expect(await screen.findByText('No tiene programas registrados.')).toBeDefined();
  });

  it('muestra el motivo exacto cuando la API no deja ver', async () => {
    fingirRed('Estudiante', [
      [
        /GET .*\/academico\/mis-programas/,
        () => json({ detail: 'La cuenta no está activa.' }, 403),
      ],
    ]);

    render(<Programas />);

    expect(await screen.findByText('La cuenta no está activa.')).toBeDefined();
  });

  it('un coordinador busca a una persona, ve sus programas y la vincula con otro', async () => {
    let vinculado = false;
    const llamadas = fingirRed('Coordinador de Programa', [
      [
        /POST .*\/vinculos/,
        () => {
          vinculado = true;
          return new Response(null, { status: 204 });
        },
      ],
      [/GET .*\/identidad\/estructura/, () => json(ESTRUCTURA_PUBLICA)],
      [/GET .*\/identidad\/personas/, () => json([{ id: 'e1', nombreCompleto: 'Laura Pérez' }])],
      [
        /GET .*\/academico\/personas\/e1\/programas/,
        () =>
          json({
            personaId: 'e1',
            nombreCompleto: 'Laura Pérez',
            rol: 'Estudiante',
            facultadAcompanada: null,
            programas: vinculado
              ? [
                  PROGRAMA,
                  {
                    ...PROGRAMA,
                    programaId: 'p2',
                    programaNombre: 'Biología',
                    facultadNombre: 'Ciencias',
                    relacion: 'Matrícula',
                  },
                ]
              : [PROGRAMA],
          }),
      ],
      [
        /GET .*\/academico\/mis-programas/,
        () => json({ ...FICHA_PROPIA, rol: 'Coordinador de Programa' }),
      ],
    ]);

    render(<Programas />);

    await userEvent.type(await screen.findByLabelText('Persona'), 'Laura');
    await userEvent.click(await screen.findByRole('option', { name: /Laura Pérez/ }));

    const ficha = (await screen.findByRole('heading', { name: 'Laura Pérez' })).closest('article')!;
    await userEvent.selectOptions(
      await within(ficha).findByLabelText('Cursa también el programa'),
      'Biología',
    );
    await userEvent.click(within(ficha).getByRole('button', { name: 'Vincular' }));

    expect(await within(ficha).findByText(/Vinculaste a la persona/)).toBeDefined();
    expect(await within(ficha).findByText('Biología', { selector: 'strong' })).toBeDefined();
    expect(llamadas.find((l) => l.metodo === 'POST')?.cuerpo).toEqual({
      programaId: 'p2',
      tipo: 'Matricula',
    });
  });

  it('a un docente se le vincula con «Docencia»', async () => {
    const llamadas = fingirRed('Rector', [
      [/POST .*\/vinculos/, () => new Response(null, { status: 204 })],
      [/GET .*\/identidad\/estructura/, () => json(ESTRUCTURA_PUBLICA)],
      [/GET .*\/identidad\/personas/, () => json([{ id: 'd1', nombreCompleto: 'Ana Gómez' }])],
      [
        /GET .*\/academico\/personas\/d1\/programas/,
        () =>
          json({
            personaId: 'd1',
            nombreCompleto: 'Ana Gómez',
            rol: 'Docente',
            facultadAcompanada: null,
            programas: [PROGRAMA],
          }),
      ],
      [
        /GET .*\/academico\/mis-programas/,
        () => json({ ...FICHA_PROPIA, rol: 'Rector', programas: [] }),
      ],
    ]);

    render(<Programas />);

    await userEvent.type(await screen.findByLabelText('Persona'), 'Ana');
    await userEvent.click(await screen.findByRole('option', { name: /Ana Gómez/ }));
    await userEvent.selectOptions(
      await screen.findByLabelText('Enseña en el programa'),
      'Biología',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Vincular' }));

    await waitFor(() => {
      expect(llamadas.some((l) => l.metodo === 'POST')).toBe(true);
    });
    expect(llamadas.find((l) => l.metodo === 'POST')?.cuerpo).toEqual({
      programaId: 'p2',
      tipo: 'Docencia',
    });
  });

  it('quita un vínculo adicional, pero no el programa principal', async () => {
    const llamadas = fingirRed('Rector', [
      [/DELETE .*\/vinculos\/p2\/Matricula/, () => new Response(null, { status: 204 })],
      [/GET .*\/identidad\/estructura/, () => json(ESTRUCTURA_PUBLICA)],
      [/GET .*\/identidad\/personas/, () => json([{ id: 'e1', nombreCompleto: 'Laura Pérez' }])],
      [
        /GET .*\/academico\/personas\/e1\/programas/,
        () =>
          json({
            personaId: 'e1',
            nombreCompleto: 'Laura Pérez',
            rol: 'Estudiante',
            facultadAcompanada: null,
            programas: [
              PROGRAMA,
              { ...PROGRAMA, programaId: 'p2', programaNombre: 'Biología', relacion: 'Matrícula' },
            ],
          }),
      ],
      [
        /GET .*\/academico\/mis-programas/,
        () => json({ ...FICHA_PROPIA, rol: 'Rector', programas: [] }),
      ],
    ]);

    render(<Programas />);

    await userEvent.type(await screen.findByLabelText('Persona'), 'Laura');
    await userEvent.click(await screen.findByRole('option', { name: /Laura Pérez/ }));

    // Solo el vínculo adicional se puede quitar.
    expect(await screen.findAllByRole('button', { name: /Quitar el vínculo/ })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Quitar el vínculo con Biología' }));

    await waitFor(() => {
      expect(llamadas.some((l) => l.metodo === 'DELETE')).toBe(true);
    });
  });
});

describe('Estructura', () => {
  const FACULTADES = [
    {
      id: 'f1',
      nombre: 'Ingenierías',
      codigo: 'ING',
      activa: true,
      programas: [
        { id: 'p1', nombre: 'Ingeniería de Sistemas', codigo: 'ISIS', activo: true },
        { id: 'p3', nombre: 'Civil', codigo: 'CIV', activo: false },
      ],
    },
  ];

  it('lista las facultades con sus programas y marca lo desactivado', async () => {
    fingirRed('Rector', [[/GET .*\/academico\/estructura/, () => json(FACULTADES)]]);

    render(<Estructura />);

    expect(await screen.findByText('Ingeniería de Sistemas')).toBeDefined();
    expect(screen.getByText(/Desactivado/)).toBeDefined();
  });

  it('crea una facultad con su nombre y su código', async () => {
    const llamadas = fingirRed('Rector', [
      [/POST .*\/academico\/facultades$/, () => json({ id: 'f9' }, 201)],
      [/GET .*\/academico\/estructura/, () => json(FACULTADES)],
    ]);

    render(<Estructura />);
    const seccion = (await screen.findByRole('heading', { name: 'Nueva facultad' })).closest(
      'section',
    )!;
    await userEvent.type(within(seccion).getByLabelText('Nombre'), 'Ciencias');
    await userEvent.type(within(seccion).getByLabelText('Código'), 'CIE');
    await userEvent.click(within(seccion).getByRole('button', { name: 'Crear facultad' }));

    await waitFor(() => {
      expect(llamadas.some((l) => l.metodo === 'POST')).toBe(true);
    });
    expect(llamadas.find((l) => l.metodo === 'POST')?.cuerpo).toEqual({
      nombre: 'Ciencias',
      codigo: 'CIE',
    });
  });

  it('desactiva una facultad y un programa con el estado que corresponde', async () => {
    const llamadas = fingirRed('Rector', [
      [/POST .*\/estado/, () => new Response(null, { status: 204 })],
      [/GET .*\/academico\/estructura/, () => json(FACULTADES)],
    ]);

    render(<Estructura />);
    await userEvent.click(await screen.findByRole('button', { name: 'Desactivar' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Desactivar Ingeniería de Sistemas' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Activar Civil' }));

    await waitFor(() => {
      expect(llamadas.filter((l) => l.metodo === 'POST')).toHaveLength(3);
    });
    const urls = llamadas.filter((l) => l.metodo === 'POST').map((l) => l.url);
    expect(urls).toContain('/api/academico/facultades/f1/estado?activa=false');
    expect(urls).toContain('/api/academico/programas/p1/estado?activo=false');
    expect(urls).toContain('/api/academico/programas/p3/estado?activo=true');
  });

  it('edita una facultad', async () => {
    const llamadas = fingirRed('Rector', [
      [/PUT .*\/academico\/facultades\/f1/, () => new Response(null, { status: 204 })],
      [/GET .*\/academico\/estructura/, () => json(FACULTADES)],
    ]);

    render(<Estructura />);
    const tarjeta = (await screen.findByRole('heading', { name: /Ingenierías/ })).closest(
      'article',
    )!;
    await userEvent.click(within(tarjeta).getByRole('button', { name: 'Editar' }));
    const nombre = within(tarjeta).getByLabelText('Nombre');
    await userEvent.clear(nombre);
    await userEvent.type(nombre, 'Ingenierías y Tecnología');
    await userEvent.click(within(tarjeta).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(llamadas.some((l) => l.metodo === 'PUT')).toBe(true);
    });
    expect(llamadas.find((l) => l.metodo === 'PUT')?.cuerpo).toEqual({
      nombre: 'Ingenierías y Tecnología',
      codigo: 'ING',
    });
  });

  it('agrega un programa a una facultad', async () => {
    const llamadas = fingirRed('Rector', [
      [/POST .*\/facultades\/f1\/programas/, () => json({ id: 'p9' }, 201)],
      [/GET .*\/academico\/estructura/, () => json(FACULTADES)],
    ]);

    render(<Estructura />);
    const tarjeta = (await screen.findByRole('heading', { name: /Ingenierías/ })).closest(
      'article',
    )!;
    await userEvent.click(within(tarjeta).getByRole('button', { name: 'Agregar programa' }));
    await userEvent.type(within(tarjeta).getByLabelText('Nombre'), 'Industrial');
    await userEvent.type(within(tarjeta).getByLabelText('Código'), 'IND');
    await userEvent.click(within(tarjeta).getByRole('button', { name: 'Crear programa' }));

    await waitFor(() => {
      expect(llamadas.some((l) => l.metodo === 'POST')).toBe(true);
    });
    expect(llamadas.find((l) => l.metodo === 'POST')?.cuerpo).toEqual({
      nombre: 'Industrial',
      codigo: 'IND',
    });
  });

  it('edita un programa', async () => {
    const llamadas = fingirRed('Rector', [
      [/PUT .*\/academico\/programas\/p1/, () => new Response(null, { status: 204 })],
      [/GET .*\/academico\/estructura/, () => json(FACULTADES)],
    ]);

    render(<Estructura />);
    const boton = await screen.findByRole('button', { name: 'Editar Ingeniería de Sistemas' });
    const fila = boton.closest('li')!;
    await userEvent.click(boton);
    const codigo = within(fila).getByLabelText('Código');
    await userEvent.clear(codigo);
    await userEvent.type(codigo, 'SIS');
    await userEvent.click(within(fila).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(llamadas.some((l) => l.metodo === 'PUT')).toBe(true);
    });
    expect(llamadas.find((l) => l.metodo === 'PUT')?.cuerpo).toEqual({
      nombre: 'Ingeniería de Sistemas',
      codigo: 'SIS',
    });
  });

  it('enseña el motivo exacto cuando la API rechaza un código repetido', async () => {
    fingirRed('Rector', [
      [
        /POST .*\/academico\/facultades$/,
        () => json({ detail: 'Ya existe una facultad con el código CIE.' }, 400),
      ],
      [/GET .*\/academico\/estructura/, () => json(FACULTADES)],
    ]);

    render(<Estructura />);
    const seccion = (await screen.findByRole('heading', { name: 'Nueva facultad' })).closest(
      'section',
    )!;
    await userEvent.type(within(seccion).getByLabelText('Nombre'), 'Ciencias');
    await userEvent.type(within(seccion).getByLabelText('Código'), 'CIE');
    await userEvent.click(within(seccion).getByRole('button', { name: 'Crear facultad' }));

    expect(await screen.findByText('Ya existe una facultad con el código CIE.')).toBeDefined();
  });

  it('un rol sin permiso recibe el motivo en lugar de la lista', async () => {
    fingirRed('Docente', [
      [
        /GET .*\/academico\/estructura/,
        () => json({ detail: 'El rol Docente no administra la estructura académica.' }, 403),
      ],
    ]);

    render(<Estructura />);

    expect(
      await screen.findByText('El rol Docente no administra la estructura académica.'),
    ).toBeDefined();
  });
});
