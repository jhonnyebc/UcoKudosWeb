import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { Indicadores } from './Indicadores';

const json = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado });

const DATOS = {
  alcance: 'Toda la universidad',
  kudosPublicados: 12,
  personasActivas: 40,
  calificacionPromedio: 4.25,
  totalCalificaciones: 8,
  reportesPendientes: 3,
  porCategoria: [
    { etiqueta: 'Liderazgo', total: 7 },
    { etiqueta: 'Apoyo', total: 5 },
  ],
  porMes: [
    { etiqueta: '2026-10', total: 0 },
    { etiqueta: '2026-11', total: 12 },
  ],
  masReconocidos: [{ etiqueta: 'Carlos Mejía', total: 6 }],
  masReconocen: [{ etiqueta: 'Ana Gómez', total: 9 }],
};

function fingirRed(respuesta: () => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(respuesta())),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Indicadores', () => {
  it('dice sobre qué ámbito son las cifras y enseña los totales', async () => {
    fingirRed(() => json(DATOS));

    render(<Indicadores />);

    expect(await screen.findByText('Toda la universidad')).toBeDefined();

    const resumen = screen.getByRole('list', { name: 'Resumen' });
    expect(within(resumen).getByText('12')).toBeDefined();
    expect(within(resumen).getByText('40')).toBeDefined();
    expect(within(resumen).getByText('4.25 de 5')).toBeDefined();
    expect(within(resumen).getByText('8 calificaciones')).toBeDefined();
    expect(within(resumen).getByText('3')).toBeDefined();
  });

  it('enseña las barras por mes y por categoría con el número escrito', async () => {
    fingirRed(() => json(DATOS));

    render(<Indicadores />);

    const meses = await screen.findByRole('region', { name: 'Reconocimientos por mes' });
    expect(within(meses).getByText('2026-11')).toBeDefined();
    expect(within(meses).getByText('12')).toBeDefined();

    const categorias = screen.getByRole('region', { name: 'Por categoría' });
    expect(within(categorias).getByText('Liderazgo')).toBeDefined();
    expect(within(categorias).getByText('7')).toBeDefined();
  });

  it('enseña quiénes más reciben y quiénes más reconocen', async () => {
    fingirRed(() => json(DATOS));

    render(<Indicadores />);

    expect(await screen.findByText('Carlos Mejía')).toBeDefined();
    expect(screen.getByText('Ana Gómez')).toBeDefined();
  });

  it('sin calificaciones enseña una raya, y sin reportes visibles no enseña esa cifra', async () => {
    fingirRed(() =>
      json({
        ...DATOS,
        calificacionPromedio: null,
        totalCalificaciones: 0,
        reportesPendientes: null,
      }),
    );

    render(<Indicadores />);

    const resumen = await screen.findByRole('list', { name: 'Resumen' });
    expect(within(resumen).getByText('—')).toBeDefined();
    expect(within(resumen).queryByText('Reportes pendientes')).toBeNull();
  });

  it('con todo en cero lo dice en lugar de dibujar barras vacías', async () => {
    fingirRed(() =>
      json({
        ...DATOS,
        kudosPublicados: 0,
        porCategoria: [],
        porMes: [{ etiqueta: '2026-11', total: 0 }],
        masReconocidos: [],
        masReconocen: [],
      }),
    );

    render(<Indicadores />);

    expect(await screen.findAllByText('Todavía no hay reconocimientos.')).toHaveLength(4);
  });

  it('un rol sin permiso recibe el motivo exacto en lugar de la pantalla', async () => {
    fingirRed(() => json({ detail: 'El rol Docente no ve los indicadores.' }, 403));

    render(<Indicadores />);

    expect(await screen.findByText('El rol Docente no ve los indicadores.')).toBeDefined();
  });

  it('no tiene problemas de accesibilidad detectables en la estructura', async () => {
    fingirRed(() => json(DATOS));

    const { container } = render(<Indicadores />);
    await screen.findByText('Toda la universidad');

    expect(
      await axe(container, { rules: { 'color-contrast': { enabled: false } } }),
    ).toHaveNoViolations();
  });
});
