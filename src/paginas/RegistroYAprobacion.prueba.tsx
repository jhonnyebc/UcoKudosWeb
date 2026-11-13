import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { Registro } from './Registro';
import { Solicitudes } from './Solicitudes';
import { Verificar } from './Verificar';

interface Llamada {
  readonly url: string;
  readonly metodo: string;
  readonly cuerpo: unknown;
}

/** Una red falsa: responde según un patrón de la dirección y apunta cada llamada. */
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

const ESTRUCTURA = [
  {
    id: 'f1',
    nombre: 'Ingenierías',
    codigo: 'ING',
    programas: [{ id: 'p1', nombre: 'Ingeniería de Sistemas', codigo: 'ISIS' }],
  },
];

const ROLES = [
  { id: 5, nombre: 'Coordinador de Programa', ambito: 'Programa' },
  { id: 7, nombre: 'Estudiante', ambito: 'Programa' },
  { id: 2, nombre: 'Rector', ambito: 'Universidad' },
];

const json = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Registro', () => {
  it('pide facultad y programa solo cuando el rol los necesita', async () => {
    fingirRed({
      '/identidad/estructura': () => json(ESTRUCTURA),
      '/identidad/roles': () => json(ROLES),
    });

    render(
      <MemoryRouter>
        <Registro />
      </MemoryRouter>,
    );

    // Estudiante es el rol por omisión: ámbito de programa.
    expect(await screen.findByLabelText('Facultad')).toBeDefined();
    expect(screen.getByLabelText('Programa académico')).toBeDefined();

    // El Rector es de ámbito universidad: no hay nada más que elegir.
    await userEvent.selectOptions(screen.getByLabelText('Rol que solicitas'), 'Rector');

    expect(screen.queryByLabelText('Facultad')).toBeNull();
    expect(screen.queryByLabelText('Programa académico')).toBeNull();
  });

  it('envía la solicitud con el rol, la facultad y el programa elegidos', async () => {
    const llamadas = fingirRed({
      '/identidad/estructura': () => json(ESTRUCTURA),
      '/identidad/roles': () => json(ROLES),
      '/identidad/registro': () => json({ id: 'x' }, 201),
    });

    render(
      <MemoryRouter>
        <Registro />
      </MemoryRouter>,
    );

    await userEvent.type(await screen.findByLabelText('Nombre completo'), 'Laura Pérez');
    await userEvent.type(screen.getByLabelText('Correo institucional'), 'laura@uco.edu.co');
    await userEvent.clear(screen.getByLabelText('Celular, con indicativo'));
    await userEvent.type(screen.getByLabelText('Celular, con indicativo'), '+573001234567');
    await userEvent.selectOptions(screen.getByLabelText('Facultad'), 'Ingenierías');
    await userEvent.selectOptions(
      screen.getByLabelText('Programa académico'),
      'Ingeniería de Sistemas',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Solicitar cuenta' }));

    await waitFor(() => {
      expect(llamadas.some((l) => l.url === '/api/identidad/registro')).toBe(true);
    });

    expect(llamadas.find((l) => l.url === '/api/identidad/registro')?.cuerpo).toEqual({
      correoInstitucional: 'laura@uco.edu.co',
      celular: '+573001234567',
      nombreCompleto: 'Laura Pérez',
      rolSolicitado: 7,
      facultadId: 'f1',
      programaId: 'p1',
    });
  });

  it('enseña el motivo que da la API cuando el correo ya existe', async () => {
    fingirRed({
      '/identidad/estructura': () => json(ESTRUCTURA),
      '/identidad/roles': () => json(ROLES),
      '/identidad/registro': () =>
        json({ detail: 'Ya existe una cuenta con el correo laura@uco.edu.co.' }, 400),
    });

    render(
      <MemoryRouter>
        <Registro />
      </MemoryRouter>,
    );

    await userEvent.type(await screen.findByLabelText('Nombre completo'), 'Laura Pérez');
    await userEvent.type(screen.getByLabelText('Correo institucional'), 'laura@uco.edu.co');
    await userEvent.selectOptions(screen.getByLabelText('Facultad'), 'Ingenierías');
    await userEvent.selectOptions(
      screen.getByLabelText('Programa académico'),
      'Ingeniería de Sistemas',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Solicitar cuenta' }));

    expect(await screen.findByText(/Ya existe una cuenta con el correo/)).toBeDefined();
  });

  it('no tiene problemas de accesibilidad detectables en la estructura', async () => {
    fingirRed({
      '/identidad/estructura': () => json(ESTRUCTURA),
      '/identidad/roles': () => json(ROLES),
    });

    const { container } = render(
      <MemoryRouter>
        <Registro />
      </MemoryRouter>,
    );
    await screen.findByLabelText('Facultad');

    expect(
      await axe(container, { rules: { 'color-contrast': { enabled: false } } }),
    ).toHaveNoViolations();
  });
});

describe('Verificar', () => {
  it('envía el código con el correo y el tipo, y marca como verificado lo que ya lo está', async () => {
    const llamadas = fingirRed({
      '/identidad/verificar': () =>
        json({
          correoVerificado: true,
          celularVerificado: false,
          solicitudAprobada: false,
          estadoCuenta: 'Pendiente',
        }),
    });

    render(
      <MemoryRouter initialEntries={['/verificar?correo=laura%40uco.edu.co']}>
        <Verificar />
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText('Código del correo'), '123456');
    await userEvent.click(screen.getAllByRole('button', { name: 'Verificar' })[0]!);

    expect(await screen.findByText(/Código del correo: verificado/)).toBeDefined();
    expect(llamadas[0]?.cuerpo).toEqual({
      correoInstitucional: 'laura@uco.edu.co',
      tipo: 'correo',
      codigo: '123456',
    });

    // Lo del celular sigue pendiente.
    expect(screen.getByLabelText('Código del celular')).toBeDefined();
  });

  it('enseña el motivo cuando el código no es correcto', async () => {
    fingirRed({
      '/identidad/verificar': () =>
        json({ detail: 'El código no es correcto o ya no está vigente.' }, 400),
    });

    render(
      <MemoryRouter initialEntries={['/verificar?correo=laura%40uco.edu.co']}>
        <Verificar />
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText('Código del correo'), '000000');
    await userEvent.click(screen.getAllByRole('button', { name: 'Verificar' })[0]!);

    expect(await screen.findByText(/no es correcto o ya no está vigente/)).toBeDefined();
  });

  it('pide códigos nuevos sin revelar si la cuenta existe', async () => {
    const llamadas = fingirRed({
      '/identidad/reenviar-codigos': () => new Response(null, { status: 204 }),
    });

    render(
      <MemoryRouter initialEntries={['/verificar?correo=laura%40uco.edu.co']}>
        <Verificar />
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Pedir códigos nuevos' }));

    expect(await screen.findByText(/Si la solicitud existe/)).toBeDefined();
    expect(llamadas[0]?.cuerpo).toEqual({ correoInstitucional: 'laura@uco.edu.co' });
  });
});

describe('Solicitudes', () => {
  const PENDIENTE = {
    id: 'u1',
    correoInstitucional: 'laura@uco.edu.co',
    nombreCompleto: 'Laura Pérez',
    rol: 'Estudiante',
    estadoCuenta: 'Pendiente',
    correoVerificado: true,
    celularVerificado: false,
  };

  it('lista las solicitudes con lo que tienen verificado', async () => {
    fingirRed({ '/solicitudes/pendientes': () => json([PENDIENTE]) });

    render(<Solicitudes />);

    expect(await screen.findByText('Laura Pérez')).toBeDefined();
    expect(screen.getByText('correo verificado · celular sin verificar')).toBeDefined();
  });

  it('aprueba una solicitud y recarga la lista', async () => {
    let aprobada = false;
    const llamadas = fingirRed({
      '/aprobar': () => {
        aprobada = true;
        return new Response(null, { status: 204 });
      },
      '/solicitudes/pendientes': () => json(aprobada ? [] : [PENDIENTE]),
    });

    render(<Solicitudes />);
    await userEvent.click(await screen.findByRole('button', { name: 'Aprobar' }));

    expect(await screen.findByText(/Aprobaste la solicitud de Laura Pérez/)).toBeDefined();
    expect(
      llamadas.some(
        (l) => l.url === '/api/identidad/solicitudes/u1/aprobar' && l.metodo === 'POST',
      ),
    ).toBe(true);
    expect(await screen.findByText('No tienes solicitudes pendientes.')).toBeDefined();
  });

  it('rechaza con motivo', async () => {
    const llamadas = fingirRed({
      '/rechazar': () => new Response(null, { status: 204 }),
      '/solicitudes/pendientes': () => json([PENDIENTE]),
    });

    render(<Solicitudes />);
    await userEvent.click(await screen.findByRole('button', { name: 'Rechazar…' }));
    await userEvent.type(
      screen.getByLabelText('Motivo del rechazo'),
      'No encontramos tu matrícula.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar rechazo' }));

    await waitFor(() => {
      expect(llamadas.some((l) => l.url.endsWith('/u1/rechazar'))).toBe(true);
    });
    expect(llamadas.find((l) => l.url.endsWith('/u1/rechazar'))?.cuerpo).toEqual({
      motivo: 'No encontramos tu matrícula.',
    });
  });

  it('enseña el motivo exacto cuando la API no deja aprobar', async () => {
    fingirRed({
      '/aprobar': () =>
        json({ detail: 'El rol Docente no aprueba solicitudes de Estudiante en ese ámbito.' }, 403),
      '/solicitudes/pendientes': () => json([PENDIENTE]),
    });

    render(<Solicitudes />);
    await userEvent.click(await screen.findByRole('button', { name: 'Aprobar' }));

    expect(await screen.findByText(/no aprueba solicitudes de Estudiante/)).toBeDefined();
  });

  it('muestra el motivo cuando no se pueden cargar', async () => {
    fingirRed({
      '/solicitudes/pendientes': () => json({ detail: 'La cuenta no está activa.' }, 403),
    });

    render(<Solicitudes />);

    expect(await screen.findByText('La cuenta no está activa.')).toBeDefined();
  });
});
