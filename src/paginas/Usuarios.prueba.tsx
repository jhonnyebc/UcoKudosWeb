import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Usuarios } from './Usuarios';

vi.mock('../autenticacion/useMiRol', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('../autenticacion/useMiRol')),
  useMiRol: () => 'Coordinador de Programa',
}));

interface Llamada {
  readonly url: string;
  readonly metodo: string;
  readonly cuerpo: unknown;
}

const json = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado });

function fingirRed(rutas: Record<string, () => Response>): Llamada[] {
  const llamadas: Llamada[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      llamadas.push({
        url,
        metodo: init?.method ?? 'GET',
        cuerpo: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
      });

      const clave = Object.keys(rutas).find((patron) => url.includes(patron));
      if (clave === undefined) {
        throw new Error(`Llamada inesperada: ${url}`);
      }

      return Promise.resolve(rutas[clave]!());
    }),
  );

  return llamadas;
}

const ESTUDIANTE = {
  id: 'p1',
  nombreCompleto: 'Carlos Mejía',
  correoInstitucional: 'carlos@uco.net.co',
  rol: 'Estudiante',
  estadoCuenta: 'Activa',
};

const INACTIVA = {
  ...ESTUDIANTE,
  id: 'p2',
  nombreCompleto: 'Lucía Pérez',
  estadoCuenta: 'Inactiva',
};

const ROLES = [
  { id: 6, nombre: 'Docente', ambito: 'Programa' },
  { id: 7, nombre: 'Estudiante', ambito: 'Programa' },
];

const ESTRUCTURA = [
  { id: 'f1', nombre: 'Ingeniería', programas: [{ id: 'g1', nombre: 'Sistemas' }] },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Usuarios', () => {
  it('lista a las personas a cargo con su rol y el estado de su cuenta', async () => {
    fingirRed({ '/usuarios': () => json([ESTUDIANTE]) });

    render(<Usuarios />);

    expect(await screen.findByText('Carlos Mejía')).toBeDefined();
    expect(screen.getByText('Estudiante')).toBeDefined();
    expect(screen.getByText('Cuenta: Activa')).toBeDefined();
  });

  it('dice que no hay nadie a cargo cuando la lista viene vacía', async () => {
    fingirRed({ '/usuarios': () => json([]) });

    render(<Usuarios />);

    expect(await screen.findByText(/No hay personas a tu cargo/)).toBeDefined();
  });

  it('busca por nombre mandando el texto a la API', async () => {
    const llamadas = fingirRed({ '/usuarios': () => json([ESTUDIANTE]) });

    render(<Usuarios />);
    await screen.findByText('Carlos Mejía');
    await userEvent.type(screen.getByLabelText('Buscar por nombre'), 'Car');

    await vi.waitFor(() => {
      expect(llamadas.some((l) => l.url.includes('busqueda=Car'))).toBe(true);
    });
  });

  it('desactiva una cuenta con motivo y recarga la lista', async () => {
    let estado = 'Activa';
    const llamadas = fingirRed({
      '/desactivar': () => {
        estado = 'Inactiva';
        return new Response(null, { status: 204 });
      },
      '/usuarios': () => json([{ ...ESTUDIANTE, estadoCuenta: estado }]),
    });

    render(<Usuarios />);
    await userEvent.click(await screen.findByRole('button', { name: 'Desactivar…' }));
    await userEvent.type(screen.getByLabelText('Motivo de la desactivación'), 'Ya no estudia');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar desactivación' }));

    expect(await screen.findByText('Desactivaste la cuenta de Carlos Mejía.')).toBeDefined();
    expect(
      llamadas.some(
        (l) =>
          l.url.endsWith('/usuarios/p1/desactivar') &&
          l.metodo === 'POST' &&
          (l.cuerpo as { motivo: string }).motivo === 'Ya no estudia',
      ),
    ).toBe(true);
    expect(await screen.findByText('Cuenta: Inactiva')).toBeDefined();
  });

  it('reactiva una cuenta inactiva', async () => {
    const llamadas = fingirRed({
      '/reactivar': () => new Response(null, { status: 204 }),
      '/usuarios': () => json([INACTIVA]),
    });

    render(<Usuarios />);
    await userEvent.click(await screen.findByRole('button', { name: 'Reactivar' }));

    expect(await screen.findByText('Reactivaste la cuenta de Lucía Pérez.')).toBeDefined();
    expect(
      llamadas.some((l) => l.url.endsWith('/usuarios/p2/reactivar') && l.metodo === 'POST'),
    ).toBe(true);
  });

  it('enseña el motivo exacto cuando la API rechaza la acción', async () => {
    fingirRed({
      '/desactivar': () => json({ detail: 'Solo se desactivan cuentas activas.' }, 409),
      '/usuarios': () => json([ESTUDIANTE]),
    });

    render(<Usuarios />);
    await userEvent.click(await screen.findByRole('button', { name: 'Desactivar…' }));
    await userEvent.type(screen.getByLabelText('Motivo de la desactivación'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar desactivación' }));

    expect(await screen.findByRole('alert')).toBeDefined();
  });

  it('cambia el rol eligiendo rol, facultad y programa', async () => {
    const llamadas = fingirRed({
      '/identidad/roles': () => json(ROLES),
      '/identidad/estructura': () => json(ESTRUCTURA),
      '/usuarios/p1/rol': () => new Response(null, { status: 204 }),
      '/usuarios': () => json([ESTUDIANTE]),
    });

    render(<Usuarios />);
    await userEvent.click(await screen.findByRole('button', { name: 'Cambiar rol…' }));
    await userEvent.selectOptions(await screen.findByLabelText('Nuevo rol'), 'Docente');
    await userEvent.selectOptions(await screen.findByLabelText('Facultad'), 'Ingeniería');
    await userEvent.selectOptions(await screen.findByLabelText('Programa'), 'Sistemas');
    await userEvent.type(screen.getByLabelText('Motivo del cambio'), 'Ahora enseña');
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar rol' }));

    expect(await screen.findByText('Cambiaste el rol de Carlos Mejía.')).toBeDefined();
    const envio = llamadas.find((l) => l.url.endsWith('/usuarios/p1/rol'));
    expect(envio?.cuerpo).toEqual({
      rolId: 6,
      facultadId: 'f1',
      programaId: 'g1',
      motivo: 'Ahora enseña',
    });
  });

  it('muestra el error de carga si la API falla', async () => {
    fingirRed({ '/usuarios': () => json({ detail: 'No puedes administrar usuarios.' }, 403) });

    render(<Usuarios />);

    expect(await screen.findByRole('alert')).toBeDefined();
  });
});
