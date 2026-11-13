import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { guardarSesion, reiniciarParaPruebas } from '../autenticacion/almacenDeSesion';
import { olvidarRoles } from '../autenticacion/useMiRol';
import { TarjetaDeKudo } from '../componentes/TarjetaDeKudo';
import { DetalleDeKudo } from './DetalleDeKudo';

const json = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado });

const KUDO = {
  id: 'k1',
  autorId: 'a1',
  autorNombre: 'Ana Gómez',
  destinatarioId: 'd1',
  destinatarioNombre: 'Luis Pérez',
  categoriaId: 'c1',
  categoriaNombre: 'Trabajo en equipo',
  contenido: 'Gracias por acompañar al grupo.',
  totalReplicas: 1,
  promedioCalificacion: null,
  totalCalificaciones: 0,
  totalAdjuntos: 0,
  publicadoEn: '2026-11-13T10:00:00Z',
};

const REPLICA = {
  id: 'r1',
  kudoId: 'k1',
  replicaPadreId: null,
  autorId: 'a1',
  autorNombre: 'Carlos Mejía',
  contenido: 'Muy merecido.',
  profundidad: 1,
  totalReplicas: 0,
  promedioCalificacion: null,
  totalCalificaciones: 0,
  publicadaEn: '2026-11-13T11:00:00Z',
};

function fingirRed(rutas: Array<[RegExp, () => Response]>) {
  guardarSesion({
    token: 'token-de-prueba',
    expiraEn: Date.now() + 3_600_000,
    nombre: 'Persona de prueba',
    personaId: 'persona-1',
  });

  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.includes('/identidad/yo')) {
        return Promise.resolve(json({ rol: 'Estudiante' }));
      }

      const ruta = rutas.find(([patron]) => patron.test(url));
      if (ruta === undefined) {
        throw new Error(`Llamada inesperada: ${url}`);
      }

      return Promise.resolve(ruta[1]());
    }),
  );
}

function pintar() {
  return render(
    <MemoryRouter initialEntries={['/kudos/k1']}>
      <Routes>
        <Route path="/kudos/:id" element={<DetalleDeKudo />} />
        <Route path="/" element={<p>Muro</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  reiniciarParaPruebas();
  olvidarRoles();
});

describe('DetalleDeKudo', () => {
  it('enseña el Kudo con su contenido y el hilo de respuestas ya abierto', async () => {
    fingirRed([
      [/\/kudos\/k1\/replicas/, () => json([REPLICA])],
      [/\/kudos\/k1$/, () => json({ kudo: KUDO, adjuntos: [] })],
    ]);

    pintar();

    expect(await screen.findByText('Gracias por acompañar al grupo.')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Ana Gómez reconoció a Luis Pérez' })).toBeDefined();

    // Sin tener que pulsar nada: en el detalle las respuestas son parte del contenido.
    expect(await screen.findByText('Muy merecido.')).toBeDefined();
  });

  it('en el detalle el título no es un enlace a sí mismo, y ofrece volver al muro', async () => {
    fingirRed([
      [/\/kudos\/k1\/replicas/, () => json([])],
      [/\/kudos\/k1$/, () => json({ kudo: KUDO, adjuntos: [] })],
    ]);

    pintar();
    await screen.findByText('Gracias por acompañar al grupo.');

    expect(screen.queryByRole('link', { name: 'Ana Gómez reconoció a Luis Pérez' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Volver al muro' }).getAttribute('href')).toBe('/');
  });

  it('dice con claridad que no existe cuando la API responde 404', async () => {
    fingirRed([[/\/kudos\/k1$/, () => new Response(null, { status: 404 })]]);

    pintar();

    expect(
      await screen.findByText('Este reconocimiento no existe o ya no está disponible.'),
    ).toBeDefined();
  });

  it('enseña el motivo exacto cuando la API no deja verlo', async () => {
    fingirRed([[/\/kudos\/k1$/, () => json({ detail: 'La cuenta no está activa.' }, 403)]]);

    pintar();

    expect(await screen.findByText('La cuenta no está activa.')).toBeDefined();
  });
});

describe('Tarjeta del muro', () => {
  it('lleva al detalle desde el título', () => {
    fingirRed([]);

    render(
      <MemoryRouter>
        <TarjetaDeKudo kudo={KUDO} />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('link', { name: 'Ana Gómez reconoció a Luis Pérez' }).getAttribute('href'),
    ).toBe('/kudos/k1');
  });
});
