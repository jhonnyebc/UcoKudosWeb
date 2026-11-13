import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { Calificador } from './Calificador';

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Calificador', () => {
  it('ofrece cinco estrellas con su nombre completo', () => {
    render(<Calificador contenidoId="k1" promedio={null} total={0} />);

    expect(screen.getByRole('button', { name: 'Calificar con 1 estrella' })).toBeDefined();
    for (const n of [2, 3, 4, 5]) {
      expect(
        screen.getByRole('button', { name: `Calificar con ${String(n)} estrellas` }),
      ).toBeDefined();
    }
  });

  it('dice que no hay calificaciones, o el promedio y el total si los hay', () => {
    const { unmount } = render(<Calificador contenidoId="k1" promedio={null} total={0} />);
    expect(screen.getByText('Sin calificaciones todavía')).toBeDefined();
    unmount();

    render(<Calificador contenidoId="k1" promedio={4.5} total={2} />);
    expect(screen.getByText(/4\.5 de 5/)).toBeDefined();
    expect(
      screen.getByText(/2 calificaciones/, { selector: '[aria-hidden="true"]' }),
    ).toBeDefined();
  });

  it('envía la calificación y enseña el promedio que calculó el servidor', async () => {
    const llamadas = fingirRed({
      '/interaccion/calificaciones': () => new Response(null, { status: 204 }),
      '/kudos/k1': () =>
        json({ kudo: { promedioCalificacion: 4.0, totalCalificaciones: 3 }, adjuntos: [] }),
    });

    render(<Calificador contenidoId="k1" promedio={null} total={0} />);
    await userEvent.click(screen.getByRole('button', { name: 'Calificar con 4 estrellas' }));

    // El promedio sale del servidor, no de una cuenta hecha aquí.
    expect(await screen.findByText(/4\.0 de 5/)).toBeDefined();
    expect(llamadas[0]).toEqual({
      url: '/api/interaccion/calificaciones',
      metodo: 'POST',
      cuerpo: { tipoContenido: 'Kudo', contenidoId: 'k1', estrellas: 4 },
    });
  });

  it('marca la estrella elegida y las anteriores', async () => {
    fingirRed({
      '/interaccion/calificaciones': () => new Response(null, { status: 204 }),
      '/kudos/k1': () =>
        json({ kudo: { promedioCalificacion: 3.0, totalCalificaciones: 1 }, adjuntos: [] }),
    });

    render(<Calificador contenidoId="k1" promedio={null} total={0} />);
    await userEvent.click(screen.getByRole('button', { name: 'Calificar con 3 estrellas' }));

    await waitFor(() => {
      expect(
        screen
          .getByRole('button', { name: 'Calificar con 3 estrellas' })
          .getAttribute('aria-pressed'),
      ).toBe('true');
    });
    expect(
      screen
        .getByRole('button', { name: 'Calificar con 4 estrellas' })
        .getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('se puede cambiar de opinión: la segunda calificación se envía también', async () => {
    const llamadas = fingirRed({
      '/interaccion/calificaciones': () => new Response(null, { status: 204 }),
      '/kudos/k1': () =>
        json({ kudo: { promedioCalificacion: 2.0, totalCalificaciones: 1 }, adjuntos: [] }),
    });

    render(<Calificador contenidoId="k1" promedio={null} total={0} />);
    await userEvent.click(screen.getByRole('button', { name: 'Calificar con 5 estrellas' }));
    await screen.findByText(/de 5/);
    await userEvent.click(screen.getByRole('button', { name: 'Calificar con 2 estrellas' }));

    await waitFor(() => {
      expect(llamadas.filter((l) => l.url === '/api/interaccion/calificaciones')).toHaveLength(2);
    });
  });

  it('enseña el motivo exacto cuando la API no deja calificar', async () => {
    fingirRed({
      '/interaccion/calificaciones': () =>
        json(
          { detail: 'Este contenido fue retirado por moderación y no se puede calificar.' },
          400,
        ),
    });

    render(<Calificador contenidoId="k1" promedio={null} total={0} />);
    await userEvent.click(screen.getByRole('button', { name: 'Calificar con 5 estrellas' }));

    expect(await screen.findByText(/retirado por moderación/)).toBeDefined();
    expect(
      screen
        .getByRole('button', { name: 'Calificar con 5 estrellas' })
        .getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('no tiene problemas de accesibilidad detectables en la estructura', async () => {
    const { container } = render(<Calificador contenidoId="k1" promedio={4.5} total={2} />);

    expect(
      await axe(container, { rules: { 'color-contrast': { enabled: false } } }),
    ).toHaveNoViolations();
  });
});
