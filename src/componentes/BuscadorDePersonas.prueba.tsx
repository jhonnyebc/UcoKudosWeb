import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import type { PersonaBuscada } from '../api/tipos';
import { BuscadorDePersonas } from './BuscadorDePersonas';

const ANA: PersonaBuscada = { id: 'id-ana', nombreCompleto: 'Ana Gómez' };
const CARLOS: PersonaBuscada = { id: 'id-carlos', nombreCompleto: 'Carlos Mejía' };

function fingirBusqueda(resultado: readonly PersonaBuscada[] | Error) {
  const espia = vi.fn(() =>
    resultado instanceof Error
      ? Promise.reject(resultado)
      : Promise.resolve(new Response(JSON.stringify(resultado), { status: 200 })),
  );

  vi.stubGlobal('fetch', espia);
  return espia;
}

/** Monta el buscador con el estado que llevaría el formulario de publicar. */
function montar(alElegir = vi.fn()) {
  const { container } = render(
    <BuscadorDePersonas id="destinatario" valor={null} alElegir={alElegir} />,
  );
  return { alElegir, container, campo: screen.getByRole('combobox') };
}

describe('BuscadorDePersonas', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('no consulta con menos de dos caracteres', async () => {
    const espia = fingirBusqueda([ANA]);
    const { campo } = montar();

    await userEvent.type(campo, 'a');

    // Se espera de más a propósito: si consultara, ya habría pasado el tiempo de espera.
    await new Promise((listo) => setTimeout(listo, 400));

    expect(espia).not.toHaveBeenCalled();
  });

  it('enseña las personas encontradas', async () => {
    fingirBusqueda([ANA, CARLOS]);
    const { campo } = montar();

    await userEvent.type(campo, 'me');

    expect(await screen.findByText('Ana Gómez')).toBeDefined();
    expect(screen.getByText('Carlos Mejía')).toBeDefined();
  });

  it('entrega la persona elegida al pulsarla', async () => {
    fingirBusqueda([ANA, CARLOS]);
    const { alElegir, campo } = montar();

    await userEvent.type(campo, 'me');
    await userEvent.click(await screen.findByText('Carlos Mejía'));

    expect(alElegir).toHaveBeenCalledWith(CARLOS);
  });

  it('se puede elegir con el teclado, sin tocar la pantalla', async () => {
    fingirBusqueda([ANA, CARLOS]);
    const { alElegir, campo } = montar();

    await userEvent.type(campo, 'me');
    await screen.findByText('Ana Gómez');

    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(alElegir).toHaveBeenCalledWith(CARLOS);
  });

  it('avisa cuando no hay nadie con ese nombre', async () => {
    fingirBusqueda([]);
    const { campo } = montar();

    await userEvent.type(campo, 'zzz');

    expect(await screen.findByText('No hay nadie con ese nombre.')).toBeDefined();
  });

  /**
   * Un fallo de red no puede dejar en pantalla los resultados del texto anterior: el usuario
   * elegiría a alguien que no corresponde a lo que está leyendo.
   */
  it('no deja resultados viejos si la búsqueda falla', async () => {
    fingirBusqueda([ANA]);
    const { campo } = montar();

    await userEvent.type(campo, 'an');
    await screen.findByText('Ana Gómez');

    fingirBusqueda(new Error('sin red'));
    await userEvent.type(campo, 'x');

    await waitFor(() => {
      expect(screen.queryByText('Ana Gómez')).toBeNull();
    });
  });

  // La regla de contraste va desactivada por la misma razón que en TarjetaDeKudo: el DOM
  // simulado no pinta, así que axe no puede medir colores y la omitiría en silencio.
  it('no tiene problemas de accesibilidad detectables en la estructura', async () => {
    fingirBusqueda([ANA, CARLOS]);
    const { campo, container } = montar();

    await userEvent.type(campo, 'me');
    await screen.findByText('Ana Gómez');

    const resultado = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    });

    expect(resultado).toHaveNoViolations();
  });
});
