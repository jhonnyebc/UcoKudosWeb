import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ErrorDeApi } from './cliente';
import { pedir } from './cliente';

/**
 * Estas pruebas existen por un fallo concreto y caro de diagnosticar.
 *
 * Al publicar un Kudo para uno mismo, la API respondía 400 con el motivo exacto en el cuerpo
 * —«No se puede publicar un Kudo para uno mismo»— y la pantalla enseñaba «Hay algo mal en los
 * datos enviados. Revisa el formulario». El usuario revisaba los campos uno por uno sin
 * encontrar nada, porque ningún campo estaba mal: lo que estaba mal era a quién se lo enviaba.
 *
 * El cliente nunca leía el cuerpo de una respuesta fallida, así que el único dato útil se perdía
 * en el camino. Lo que se prueba aquí es que ese dato llega hasta el usuario.
 */

function respuestaDeProblema(estado: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'Content-Type': 'application/problem+json' },
  });
}

function fingirFetch(respuesta: Response): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(respuesta)),
  );
}

async function errorAlPedir(): Promise<ErrorDeApi> {
  try {
    await pedir('/kudos', { metodo: 'POST', cuerpo: {} });
  } catch (causa) {
    return causa as ErrorDeApi;
  }

  throw new Error('Se esperaba un error y la petición salió bien.');
}

describe('cliente de la API', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('enseña el motivo que da la API en lugar del mensaje genérico', async () => {
    fingirFetch(
      respuestaDeProblema(400, {
        title: 'Solicitud no válida',
        detail: 'No se puede publicar un Kudo para uno mismo.',
      }),
    );

    const error = await errorAlPedir();

    expect(error.message).toBe('No se puede publicar un Kudo para uno mismo.');
    expect(error.estado).toBe(400);
  });

  it('cae al mensaje genérico cuando la API no explica el motivo', async () => {
    fingirFetch(respuestaDeProblema(400, { title: 'Solicitud no válida' }));

    const error = await errorAlPedir();

    expect(error.message).toBe('Hay algo mal en los datos enviados. Revisa el formulario.');
  });

  it('no se rompe si el cuerpo del error no es JSON', async () => {
    fingirFetch(new Response('<html>502</html>', { status: 400 }));

    const error = await errorAlPedir();

    expect(error.message).toBe('Hay algo mal en los datos enviados. Revisa el formulario.');
  });

  // Un 5xx se queda con el mensaje genérico a propósito: el detalle de un error del servidor
  // describe sus tripas, no algo que quien llama pueda corregir, y no debe salir a la pantalla.
  it('nunca enseña el detalle de un error del servidor', async () => {
    fingirFetch(
      respuestaDeProblema(500, {
        title: 'Error interno',
        detail: 'Npgsql.PostgresException: relation "kudos" does not exist',
      }),
    );

    const error = await errorAlPedir();

    expect(error.message).toBe('La plataforma tuvo un problema. Inténtalo de nuevo en un momento.');
    expect(error.message).not.toContain('Npgsql');
  });

  it('mantiene la marca de autenticación del 401', async () => {
    fingirFetch(respuestaDeProblema(401, { detail: 'El token expiró.' }));

    const error = await errorAlPedir();

    expect(error.esDeAutenticacion).toBe(true);
  });
});
