import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { AdjuntosDeKudo } from './AdjuntosDeKudo';

const DETALLE = {
  kudo: {},
  adjuntos: [
    { id: 'a1', nombreOriginal: 'acta.pdf', tipoDetectado: 'application/pdf', tamanoBytes: 2048 },
    {
      id: 'a2',
      nombreOriginal: 'foto.png',
      tipoDetectado: 'image/png',
      tamanoBytes: 2.5 * 1024 * 1024,
    },
  ],
};

function fingirRed(rutas: Record<string, () => Response>) {
  const espia = vi.fn((url: string) => {
    const clave = Object.keys(rutas).find((patron) => url.includes(patron));
    if (clave === undefined) {
      throw new Error(`Llamada inesperada: ${url}`);
    }
    return Promise.resolve(rutas[clave]!());
  });

  vi.stubGlobal('fetch', espia);
  return espia;
}

describe('AdjuntosDeKudo', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('dice cuántos adjuntos hay sin pedir nada a la red', () => {
    const espia = fingirRed({});

    render(<AdjuntosDeKudo kudoId="k1" total={2} />);

    expect(screen.getByRole('button', { name: /ver 2 adjuntos/i })).toBeDefined();
    // El muro no paga una consulta por cada Kudo que tiene adjuntos: solo si alguien los abre.
    expect(espia).not.toHaveBeenCalled();
  });

  it('usa el singular con un solo adjunto', () => {
    render(<AdjuntosDeKudo kudoId="k1" total={1} />);

    expect(screen.getByRole('button', { name: /ver 1 adjunto$/i })).toBeDefined();
  });

  it('carga y enseña los nombres y tamaños al abrirlos', async () => {
    fingirRed({ '/kudos/k1': () => new Response(JSON.stringify(DETALLE)) });

    render(<AdjuntosDeKudo kudoId="k1" total={2} />);
    await userEvent.click(screen.getByRole('button', { name: /ver 2 adjuntos/i }));

    expect(await screen.findByRole('button', { name: 'acta.pdf' })).toBeDefined();
    expect(screen.getByText('(2 KB)')).toBeDefined();
    expect(screen.getByText('(2,5 MB)')).toBeDefined();
  });

  it('indica con aria-expanded si el panel está abierto', async () => {
    fingirRed({ '/kudos/k1': () => new Response(JSON.stringify(DETALLE)) });

    render(<AdjuntosDeKudo kudoId="k1" total={2} />);
    const boton = screen.getByRole('button', { name: /ver 2 adjuntos/i });

    expect(boton.getAttribute('aria-expanded')).toBe('false');

    await userEvent.click(boton);

    expect(boton.getAttribute('aria-expanded')).toBe('true');
  });

  it('no vuelve a consultar al cerrar y abrir otra vez', async () => {
    const espia = fingirRed({ '/kudos/k1': () => new Response(JSON.stringify(DETALLE)) });

    render(<AdjuntosDeKudo kudoId="k1" total={2} />);
    const boton = screen.getByRole('button', { name: /ver 2 adjuntos/i });

    await userEvent.click(boton);
    await screen.findByRole('button', { name: 'acta.pdf' });
    await userEvent.click(boton);
    await userEvent.click(boton);

    expect(espia).toHaveBeenCalledTimes(1);
  });

  it('muestra el motivo cuando la API rechaza la consulta', async () => {
    fingirRed({
      '/kudos/k1': () =>
        new Response(JSON.stringify({ detail: 'Este contenido fue retirado por moderación.' }), {
          status: 403,
        }),
    });

    render(<AdjuntosDeKudo kudoId="k1" total={2} />);
    await userEvent.click(screen.getByRole('button', { name: /ver 2 adjuntos/i }));

    expect(await screen.findByText('Este contenido fue retirado por moderación.')).toBeDefined();
  });

  /**
   * La ventana se abre antes de descargar. Si se abriera después de esperar a la red, Safari
   * en el celular la bloquearía como emergente, y el celular es el 90 % de los usuarios.
   */
  it('abre la ventana antes de descargar y la dirige al archivo', async () => {
    const ventana = { opener: 'pagina' as unknown, location: { href: '' }, close: vi.fn() };
    const abrir = vi.fn(() => ventana);
    vi.stubGlobal('open', abrir);
    // jsdom no implementa las URL locales de Blob.
    URL.createObjectURL = vi.fn(() => 'blob:local/acta');
    URL.revokeObjectURL = vi.fn();

    fingirRed({
      '/kudos/k1/adjuntos/a1/archivo': () =>
        new Response('%PDF-1.7', { headers: { 'Content-Type': 'application/pdf' } }),
      '/kudos/k1': () => new Response(JSON.stringify(DETALLE)),
    });

    render(<AdjuntosDeKudo kudoId="k1" total={2} />);
    await userEvent.click(screen.getByRole('button', { name: /ver 2 adjuntos/i }));
    await userEvent.click(await screen.findByRole('button', { name: 'acta.pdf' }));

    await waitFor(() => {
      expect(ventana.location.href).toBe('blob:local/acta');
    });

    expect(abrir).toHaveBeenCalledTimes(1);
    // Se corta la relación con la aplicación: lo que cargue la pestaña no puede tocarla.
    expect(ventana.opener).toBeNull();
  });

  it('cierra la ventana en blanco si no se pudo descargar el archivo', async () => {
    const ventana = { opener: null as unknown, location: { href: '' }, close: vi.fn() };
    vi.stubGlobal(
      'open',
      vi.fn(() => ventana),
    );

    fingirRed({
      '/kudos/k1/adjuntos/a1/archivo': () =>
        new Response(JSON.stringify({ detail: 'Este Kudo no tiene el adjunto indicado.' }), {
          status: 400,
        }),
      '/kudos/k1': () => new Response(JSON.stringify(DETALLE)),
    });

    render(<AdjuntosDeKudo kudoId="k1" total={2} />);
    await userEvent.click(screen.getByRole('button', { name: /ver 2 adjuntos/i }));
    await userEvent.click(await screen.findByRole('button', { name: 'acta.pdf' }));

    // Una pestaña en blanco que nadie va a usar es peor que ninguna.
    await waitFor(() => {
      expect(ventana.close).toHaveBeenCalled();
    });
    expect(await screen.findByText('Este Kudo no tiene el adjunto indicado.')).toBeDefined();
  });

  it('no tiene problemas de accesibilidad detectables en la estructura', async () => {
    fingirRed({ '/kudos/k1': () => new Response(JSON.stringify(DETALLE)) });

    const { container } = render(<AdjuntosDeKudo kudoId="k1" total={2} />);
    await userEvent.click(screen.getByRole('button', { name: /ver 2 adjuntos/i }));
    await screen.findByRole('button', { name: 'acta.pdf' });

    const resultado = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    });

    expect(resultado).toHaveNoViolations();
  });
});
