import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { guardarSesion, reiniciarParaPruebas } from '../autenticacion/almacenDeSesion';
import { olvidarRoles } from '../autenticacion/useMiRol';
import { AccionesDeModeracion } from './AccionesDeModeracion';

interface Llamada {
  readonly url: string;
  readonly metodo: string;
  readonly cuerpo: unknown;
}

const json = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado });

/** Entra con una sesión y finge la red; `rol` es lo que la API dice que es esa persona. */
function entrarComo(rol: string, rutas: Record<string, () => Response> = {}): Llamada[] {
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
      llamadas.push({
        url,
        metodo: init?.method ?? 'GET',
        cuerpo: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
      });

      if (url.includes('/identidad/yo')) {
        return Promise.resolve(json({ rol }));
      }

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
  reiniciarParaPruebas();
  olvidarRoles();
});

describe('AccionesDeModeracion', () => {
  it('cualquier usuario puede reportar, pero «Vetar» no se le ofrece a un estudiante', async () => {
    const llamadas = entrarComo('Estudiante');

    render(<AccionesDeModeracion tipo="Kudo" contenidoId="k1" alVetar={() => undefined} />);

    expect(screen.getByRole('button', { name: 'Reportar' })).toBeDefined();

    // Se espera a que el rol llegue para no confundir «todavía no sé» con «no puede».
    await waitFor(() => {
      expect(llamadas.some((l) => l.url.includes('/identidad/yo'))).toBe(true);
    });
    await new Promise((resolver) => setTimeout(resolver, 20));

    expect(screen.queryByRole('button', { name: 'Vetar' })).toBeNull();
  });

  it.each(['Rector', 'Coordinador Académico'])('«Vetar» se ofrece al rol %s', async (rol) => {
    entrarComo(rol);

    render(<AccionesDeModeracion tipo="Kudo" contenidoId="k1" alVetar={() => undefined} />);

    expect(await screen.findByRole('button', { name: 'Vetar' })).toBeDefined();
  });

  it('no se ofrece vetar al Administrador, aunque sea el rol más alto', async () => {
    const llamadas = entrarComo('Administrador del Sistema');

    render(<AccionesDeModeracion tipo="Kudo" contenidoId="k1" alVetar={() => undefined} />);

    await waitFor(() => {
      expect(llamadas.some((l) => l.url.includes('/identidad/yo'))).toBe(true);
    });
    await new Promise((resolver) => setTimeout(resolver, 20));

    expect(screen.queryByRole('button', { name: 'Vetar' })).toBeNull();
  });

  it('reporta con el motivo y lo agradece', async () => {
    const llamadas = entrarComo('Estudiante', {
      '/moderacion/reportes': () => new Response(null, { status: 202 }),
    });

    render(<AccionesDeModeracion tipo="Kudo" contenidoId="k1" alVetar={() => undefined} />);

    await userEvent.click(screen.getByRole('button', { name: 'Reportar' }));
    await userEvent.type(screen.getByLabelText('Motivo del reporte'), 'Me parece ofensivo.');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar reporte' }));

    expect(await screen.findByText(/tu reporte llegó a quien modera/)).toBeDefined();
    expect(llamadas.find((l) => l.url === '/api/moderacion/reportes')?.cuerpo).toEqual({
      tipoContenido: 'Kudo',
      contenidoId: 'k1',
      motivo: 'Me parece ofensivo.',
    });
  });

  it('no deja enviar un reporte sin motivo', async () => {
    entrarComo('Estudiante');

    render(<AccionesDeModeracion tipo="Kudo" contenidoId="k1" alVetar={() => undefined} />);

    await userEvent.click(screen.getByRole('button', { name: 'Reportar' }));

    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Enviar reporte' }).disabled).toBe(
      true,
    );
  });

  it('veta con el motivo, avisa de las consecuencias y retira el contenido', async () => {
    const alVetar = vi.fn();
    const llamadas = entrarComo('Rector', {
      '/moderacion/vetos': () => json({ contenidosAfectados: 4, enCascada: true }),
    });

    render(<AccionesDeModeracion tipo="Kudo" contenidoId="k1" alVetar={alVetar} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Vetar' }));

    // Antes de confirmar se dice qué va a pasar: no hay botón para deshacerlo.
    expect(screen.getByText(/No se puede deshacer/)).toBeDefined();

    await userEvent.type(screen.getByLabelText('Motivo del veto'), 'Lenguaje ofensivo.');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar veto' }));

    await waitFor(() => {
      expect(alVetar).toHaveBeenCalledTimes(1);
    });
    expect(llamadas.find((l) => l.url === '/api/moderacion/vetos')?.cuerpo).toEqual({
      tipoContenido: 'Kudo',
      contenidoId: 'k1',
      motivo: 'Lenguaje ofensivo.',
    });
  });

  it('enseña el motivo exacto cuando la API no deja vetar, y no retira nada', async () => {
    const alVetar = vi.fn();
    entrarComo('Rector', {
      '/moderacion/vetos': () => json({ detail: 'El Kudo indicado no existe.' }, 400),
    });

    render(<AccionesDeModeracion tipo="Kudo" contenidoId="k1" alVetar={alVetar} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Vetar' }));
    await userEvent.type(screen.getByLabelText('Motivo del veto'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar veto' }));

    expect(await screen.findByText('El Kudo indicado no existe.')).toBeDefined();
    expect(alVetar).not.toHaveBeenCalled();
  });

  it('cancelar vuelve a los botones sin enviar nada', async () => {
    const llamadas = entrarComo('Estudiante');

    render(<AccionesDeModeracion tipo="Replica" contenidoId="r1" alVetar={() => undefined} />);

    await userEvent.click(screen.getByRole('button', { name: 'Reportar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.getByRole('button', { name: 'Reportar' })).toBeDefined();
    expect(llamadas.some((l) => l.url.includes('/moderacion'))).toBe(false);
  });

  it('pregunta el rol una sola vez aunque haya muchas tarjetas', async () => {
    const llamadas = entrarComo('Estudiante');

    render(
      <>
        <AccionesDeModeracion tipo="Kudo" contenidoId="k1" alVetar={() => undefined} />
        <AccionesDeModeracion tipo="Kudo" contenidoId="k2" alVetar={() => undefined} />
        <AccionesDeModeracion tipo="Kudo" contenidoId="k3" alVetar={() => undefined} />
      </>,
    );

    await waitFor(() => {
      expect(llamadas.some((l) => l.url.includes('/identidad/yo'))).toBe(true);
    });

    expect(llamadas.filter((l) => l.url.includes('/identidad/yo'))).toHaveLength(1);
  });
});
