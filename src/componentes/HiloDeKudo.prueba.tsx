import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { guardarSesion, reiniciarParaPruebas } from '../autenticacion/almacenDeSesion';
import { olvidarRoles } from '../autenticacion/useMiRol';
import { HiloDeKudo } from './HiloDeKudo';

interface Llamada {
  readonly url: string;
  readonly metodo: string;
  readonly cuerpo: unknown;
}

const json = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado });

function replica(id: string, profundidad: number, extra: object = {}) {
  return {
    id,
    kudoId: 'k1',
    replicaPadreId: null,
    autorId: 'a1',
    autorNombre: 'Ana Gómez',
    contenido: `Respuesta ${id}`,
    profundidad,
    totalReplicas: 0,
    promedioCalificacion: null,
    totalCalificaciones: 0,
    publicadaEn: '2026-11-13T10:00:00Z',
    ...extra,
  };
}

/** Red falsa. Las rutas se prueban por orden: pon primero las más específicas. */
function fingirRed(rutas: Array<[RegExp, (init?: RequestInit) => Response]>): Llamada[] {
  const llamadas: Llamada[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      llamadas.push({
        url,
        metodo: init?.method ?? 'GET',
        cuerpo: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
      });

      if (url.includes('/identidad/yo')) {
        return Promise.resolve(json({ rol: 'Estudiante' }));
      }

      const ruta = rutas.find(([patron]) => patron.test(`${init?.method ?? 'GET'} ${url}`));
      if (ruta === undefined) {
        throw new Error(`Llamada inesperada: ${init?.method ?? 'GET'} ${url}`);
      }

      return Promise.resolve(ruta[1](init));
    }),
  );

  return llamadas;
}

function entrar() {
  guardarSesion({
    token: 'token-de-prueba',
    expiraEn: Date.now() + 3_600_000,
    nombre: 'Persona de prueba',
    personaId: 'persona-1',
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  reiniciarParaPruebas();
  olvidarRoles();
});

describe('HiloDeKudo', () => {
  it('con respuestas, ofrece verlas con su cantidad; sin ellas, ofrece responder', () => {
    entrar();
    fingirRed([]);

    const { unmount } = render(<HiloDeKudo kudoId="k1" total={3} />);
    expect(screen.getByRole('button', { name: 'Ver 3 respuestas' })).toBeDefined();
    unmount();

    render(<HiloDeKudo kudoId="k1" total={0} />);
    expect(screen.getByRole('button', { name: 'Responder' })).toBeDefined();
  });

  it('no pide el hilo hasta que se abre, y solo la primera vez', async () => {
    entrar();
    const llamadas = fingirRed([
      [/GET \/api\/kudos\/k1\/replicas/, () => json([replica('r1', 1)])],
    ]);

    render(<HiloDeKudo kudoId="k1" total={1} />);
    expect(llamadas.filter((l) => l.url.includes('/replicas'))).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Ver 1 respuesta' }));
    await screen.findByText('Respuesta r1');
    await userEvent.click(screen.getByRole('button', { name: 'Ocultar 1 respuesta' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ver 1 respuesta' }));

    expect(llamadas.filter((l) => l.metodo === 'GET' && l.url.includes('/replicas'))).toHaveLength(
      1,
    );
  });

  it('pinta el hilo en el orden recibido y con sangría según la profundidad', async () => {
    entrar();
    fingirRed([
      [
        /GET \/api\/kudos\/k1\/replicas/,
        () => json([replica('r1', 1), replica('r2', 2), replica('r3', 3), replica('r4', 1)]),
      ],
    ]);

    render(<HiloDeKudo kudoId="k1" total={4} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ver 4 respuestas' }));

    const filas = await screen.findAllByRole('listitem');

    expect(
      filas.map((f) => f.textContent?.includes(`Respuesta r${String(filas.indexOf(f) + 1)}`)),
    ).toEqual([true, true, true, true]);
    expect(filas.map((f) => f.style.marginLeft)).toEqual(['0rem', '1rem', '2rem', '0rem']);
  });

  it('la sangría deja de crecer a partir de cierta profundidad', async () => {
    entrar();
    fingirRed([[/GET \/api\/kudos\/k1\/replicas/, () => json([replica('r1', 20)])]]);

    render(<HiloDeKudo kudoId="k1" total={1} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ver 1 respuesta' }));

    const fila = await screen.findByRole('listitem');
    expect(fila.style.marginLeft).toBe('5rem');
  });

  it('enseña el nombre del autor de cada respuesta', async () => {
    entrar();
    fingirRed([
      [
        /GET \/api\/kudos\/k1\/replicas/,
        () => json([replica('r1', 1, { autorNombre: 'Carlos Mejía' })]),
      ],
    ]);

    render(<HiloDeKudo kudoId="k1" total={1} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ver 1 respuesta' }));

    expect(await screen.findByText('Carlos Mejía')).toBeDefined();
  });

  it('responde al Kudo, sin padre, y recarga el hilo', async () => {
    entrar();
    let publicada = false;
    const llamadas = fingirRed([
      [
        /POST \/api\/kudos\/k1\/replicas/,
        () => {
          publicada = true;
          return json(replica('nueva', 1), 201);
        },
      ],
      [/GET \/api\/kudos\/k1\/replicas/, () => json(publicada ? [replica('nueva', 1)] : [])],
    ]);

    render(<HiloDeKudo kudoId="k1" total={0} />);
    await userEvent.click(screen.getByRole('button', { name: 'Responder' }));
    await userEvent.type(await screen.findByLabelText('Responder al Kudo'), 'Muy bien.');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar respuesta' }));

    expect(await screen.findByText('Respuesta nueva')).toBeDefined();
    expect(llamadas.find((l) => l.metodo === 'POST')?.cuerpo).toEqual({
      contenido: 'Muy bien.',
      replicaPadreId: null,
    });
  });

  it('responde a una respuesta, con su identificador como padre', async () => {
    entrar();
    const llamadas = fingirRed([
      [/POST \/api\/kudos\/k1\/replicas/, () => json(replica('hija', 2), 201)],
      [/GET \/api\/kudos\/k1\/replicas/, () => json([replica('r1', 1)])],
    ]);

    render(<HiloDeKudo kudoId="k1" total={1} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ver 1 respuesta' }));

    const fila = await screen.findByRole('listitem');
    await userEvent.click(within(fila).getByRole('button', { name: 'Responder' }));
    await userEvent.type(within(fila).getByLabelText('Responder a Ana Gómez'), 'De acuerdo.');
    await userEvent.click(within(fila).getByRole('button', { name: 'Enviar respuesta' }));

    await waitFor(() => {
      expect(llamadas.some((l) => l.metodo === 'POST')).toBe(true);
    });
    expect(llamadas.find((l) => l.metodo === 'POST')?.cuerpo).toEqual({
      contenido: 'De acuerdo.',
      replicaPadreId: 'r1',
    });
  });

  it('enseña el motivo exacto cuando la API no deja responder, y conserva lo escrito', async () => {
    entrar();
    fingirRed([
      [
        /POST \/api\/kudos\/k1\/replicas/,
        () =>
          json({ detail: 'No se puede responder a un contenido retirado por moderación.' }, 400),
      ],
      [/GET \/api\/kudos\/k1\/replicas/, () => json([])],
    ]);

    render(<HiloDeKudo kudoId="k1" total={0} />);
    await userEvent.click(screen.getByRole('button', { name: 'Responder' }));
    await userEvent.type(await screen.findByLabelText('Responder al Kudo'), 'Hola.');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar respuesta' }));

    expect(await screen.findByText(/retirado por moderación/)).toBeDefined();
    expect(screen.getByLabelText<HTMLTextAreaElement>('Responder al Kudo').value).toBe('Hola.');
  });

  it('no deja enviar una respuesta vacía', async () => {
    entrar();
    fingirRed([[/GET \/api\/kudos\/k1\/replicas/, () => json([])]]);

    render(<HiloDeKudo kudoId="k1" total={0} />);
    await userEvent.click(screen.getByRole('button', { name: 'Responder' }));

    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Enviar respuesta' }).disabled,
    ).toBe(true);
  });

  it('muestra el motivo cuando no se puede cargar el hilo', async () => {
    entrar();
    fingirRed([
      [/GET \/api\/kudos\/k1\/replicas/, () => json({ detail: 'La cuenta no está activa.' }, 403)],
    ]);

    render(<HiloDeKudo kudoId="k1" total={2} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ver 2 respuestas' }));

    expect(await screen.findByText('La cuenta no está activa.')).toBeDefined();
  });

  it('califica una respuesta con el tipo «Replica» y enseña el promedio del hilo recargado', async () => {
    entrar();
    let calificada = false;
    const llamadas = fingirRed([
      [
        /POST \/api\/interaccion\/calificaciones/,
        () => {
          calificada = true;
          return new Response(null, { status: 204 });
        },
      ],
      [
        /GET \/api\/kudos\/k1\/replicas/,
        () =>
          json([
            replica('r1', 1, calificada ? { promedioCalificacion: 4, totalCalificaciones: 1 } : {}),
          ]),
      ],
    ]);

    render(<HiloDeKudo kudoId="k1" total={1} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ver 1 respuesta' }));
    await screen.findByText('Respuesta r1');
    await userEvent.click(screen.getByRole('button', { name: 'Calificar con 4 estrellas' }));

    expect(await screen.findByText(/4\.0 de 5/)).toBeDefined();
    expect(llamadas.find((l) => l.url === '/api/interaccion/calificaciones')?.cuerpo).toEqual({
      tipoContenido: 'Replica',
      contenidoId: 'r1',
      estrellas: 4,
    });
  });

  it('cada respuesta se puede reportar', async () => {
    entrar();
    fingirRed([[/GET \/api\/kudos\/k1\/replicas/, () => json([replica('r1', 1)])]]);

    render(<HiloDeKudo kudoId="k1" total={1} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ver 1 respuesta' }));

    expect(await screen.findByRole('button', { name: 'Reportar' })).toBeDefined();
  });

  it('no tiene problemas de accesibilidad detectables en la estructura', async () => {
    entrar();
    fingirRed([
      [/GET \/api\/kudos\/k1\/replicas/, () => json([replica('r1', 1), replica('r2', 2)])],
    ]);

    const { container } = render(<HiloDeKudo kudoId="k1" total={2} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ver 2 respuestas' }));
    await screen.findByText('Respuesta r2');

    expect(
      await axe(container, { rules: { 'color-contrast': { enabled: false } } }),
    ).toHaveNoViolations();
  });
});
