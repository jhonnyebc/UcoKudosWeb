import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Moderacion } from './Moderacion';

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

const REPORTE = {
  id: 'r1',
  tipoContenido: 'Kudo',
  contenidoId: 'k1',
  motivo: 'Me parece ofensivo.',
  reportadoPor: 'Carlos Mejía',
  autorDelContenido: 'Ana Gómez',
  contenido: 'Un mensaje reportado.',
  presentadoEn: '2026-11-13T10:00:00Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Moderacion', () => {
  it('muestra cada reporte con el contenido reportado, su autor y quién lo reportó', async () => {
    fingirRed({ '/moderacion/reportes': () => json([REPORTE]) });

    render(<Moderacion />);

    expect(await screen.findByText('Un mensaje reportado.')).toBeDefined();
    expect(screen.getByText('Publicado por Ana Gómez')).toBeDefined();
    expect(screen.getByText(/Reportado por Carlos Mejía:/)).toBeDefined();
    expect(screen.getByText(/Me parece ofensivo\./)).toBeDefined();
  });

  it('dice que no hay reportes cuando la lista está vacía', async () => {
    fingirRed({ '/moderacion/reportes': () => json([]) });

    render(<Moderacion />);

    expect(await screen.findByText('No hay reportes pendientes.')).toBeDefined();
  });

  it('descarta un reporte y recarga la lista', async () => {
    let descartado = false;
    const llamadas = fingirRed({
      '/descartar': () => {
        descartado = true;
        return new Response(null, { status: 204 });
      },
      '/moderacion/reportes': () => json(descartado ? [] : [REPORTE]),
    });

    render(<Moderacion />);
    await userEvent.click(await screen.findByRole('button', { name: 'Descartar reporte' }));

    expect(await screen.findByText(/el contenido sigue visible/)).toBeDefined();
    expect(
      llamadas.some(
        (l) => l.url === '/api/moderacion/reportes/r1/descartar' && l.metodo === 'POST',
      ),
    ).toBe(true);
    expect(await screen.findByText('No hay reportes pendientes.')).toBeDefined();
  });

  it('veta con motivo, tras decir lo que implica', async () => {
    let vetado = false;
    const llamadas = fingirRed({
      '/moderacion/vetos': () => {
        vetado = true;
        return json({ contenidosAfectados: 1, enCascada: false });
      },
      '/moderacion/reportes': () => json(vetado ? [] : [REPORTE]),
    });

    render(<Moderacion />);
    await userEvent.click(await screen.findByRole('button', { name: 'Vetar…' }));

    expect(screen.getByText(/avisa a su autor con el motivo/)).toBeDefined();

    await userEvent.type(screen.getByLabelText('Motivo del veto'), 'Lenguaje ofensivo.');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar veto' }));

    await waitFor(() => {
      expect(llamadas.some((l) => l.url === '/api/moderacion/vetos')).toBe(true);
    });
    expect(llamadas.find((l) => l.url === '/api/moderacion/vetos')?.cuerpo).toEqual({
      tipoContenido: 'Kudo',
      contenidoId: 'k1',
      motivo: 'Lenguaje ofensivo.',
    });
    expect(await screen.findByText(/quedó vetado y su autor fue avisado/)).toBeDefined();
  });

  it('enseña el motivo exacto cuando un rol sin permiso intenta entrar', async () => {
    fingirRed({
      '/moderacion/reportes': () => json({ detail: 'El rol Docente no modera contenido.' }, 403),
    });

    render(<Moderacion />);

    expect(await screen.findByText('El rol Docente no modera contenido.')).toBeDefined();
  });
});
