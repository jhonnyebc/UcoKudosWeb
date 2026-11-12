import { afterEach, describe, expect, it, vi } from 'vitest';

import { guardarSesion, reiniciarParaPruebas } from '../autenticacion/almacenDeSesion';
import {
  MAXIMO_POR_KUDO,
  TAMANO_MAXIMO_BYTES,
  pedirEnlaceDeDescarga,
  subirAdjunto,
  tamanoLegible,
  validarSeleccion,
} from './adjuntos';

function unArchivo(nombre: string, tipo: string, bytes = 1024): File {
  return new File([new Uint8Array(bytes)], nombre, { type: tipo });
}

describe('validar la selección de adjuntos', () => {
  it('acepta imágenes y PDF dentro del límite', () => {
    const archivos = [
      unArchivo('foto.jpg', 'image/jpeg'),
      unArchivo('captura.png', 'image/png'),
      unArchivo('imagen.webp', 'image/webp'),
      unArchivo('acta.pdf', 'application/pdf'),
    ];

    expect(validarSeleccion(archivos)).toBeNull();
  });

  it('no pide nada si no hay archivos', () => {
    expect(validarSeleccion([])).toBeNull();
  });

  it('rechaza un tipo que el dominio no admite, nombrando el archivo', () => {
    const motivo = validarSeleccion([unArchivo('programa.exe', 'application/x-msdownload')]);

    expect(motivo).toContain('programa.exe');
  });

  it('rechaza un archivo que pasa del tamaño máximo', () => {
    const motivo = validarSeleccion([
      unArchivo('enorme.pdf', 'application/pdf', TAMANO_MAXIMO_BYTES + 1),
    ]);

    expect(motivo).toContain('enorme.pdf');
    expect(motivo).toContain('5 MB');
  });

  it('acepta un archivo que pesa exactamente el máximo', () => {
    // El límite del dominio es «mayor que», así que el borde exacto es válido.
    expect(
      validarSeleccion([unArchivo('justo.pdf', 'application/pdf', TAMANO_MAXIMO_BYTES)]),
    ).toBeNull();
  });

  it('rechaza un archivo vacío', () => {
    expect(validarSeleccion([unArchivo('vacio.pdf', 'application/pdf', 0)])).toContain('vacío');
  });

  it('rechaza más archivos de los que admite un Kudo', () => {
    const demasiados = Array.from({ length: MAXIMO_POR_KUDO + 1 }, (_, i) =>
      unArchivo(`a${i}.pdf`, 'application/pdf'),
    );

    expect(validarSeleccion(demasiados)).toContain(`${MAXIMO_POR_KUDO}`);
  });
});

describe('tamaño legible', () => {
  it.each([
    [512, '512 B'],
    [2048, '2 KB'],
    [2.5 * 1024 * 1024, '2,5 MB'],
  ])('%d bytes se escribe %s', (bytes, esperado) => {
    expect(tamanoLegible(bytes)).toBe(esperado);
  });
});

describe('subir un adjunto', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    reiniciarParaPruebas();
  });

  /** Una llamada registrada: a dónde fue, con qué método y con qué cabeceras. */
  interface Llamada {
    readonly url: string;
    readonly metodo: string;
    readonly cabeceras: Record<string, string>;
    readonly cuerpo: unknown;
  }

  function fingirRed(respuestas: Record<string, () => Response>): Llamada[] {
    const llamadas: Llamada[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, opciones?: RequestInit) => {
        llamadas.push({
          url,
          metodo: opciones?.method ?? 'GET',
          cabeceras: (opciones?.headers ?? {}) as Record<string, string>,
          cuerpo: opciones?.body,
        });

        const clave = Object.keys(respuestas).find((patron) => url.includes(patron));
        if (clave === undefined) {
          throw new Error(`Llamada inesperada: ${url}`);
        }

        return Promise.resolve(respuestas[clave]!());
      }),
    );

    return llamadas;
  }

  const URL_ALMACENAMIENTO = 'https://kudos.ejemplo.test/adjuntos/kudos/k1/a1?X-Amz-Signature=abc';

  const permiso = () =>
    new Response(
      JSON.stringify({ adjuntoId: 'a1', urlDeSubida: URL_ALMACENAMIENTO, validezMinutos: 10 }),
      { status: 200 },
    );

  it('sigue los tres pasos en orden: pedir permiso, subir y confirmar', async () => {
    const archivo = unArchivo('acta.pdf', 'application/pdf');
    const llamadas = fingirRed({
      '/adjuntos/intencion': permiso,
      '/adjuntos/kudos/': () => new Response(null, { status: 200 }),
      '/confirmar': () => new Response(null, { status: 204 }),
    });

    await subirAdjunto('k1', archivo);

    expect(llamadas.map((l) => l.metodo)).toEqual(['POST', 'PUT', 'POST']);
    expect(llamadas[0]?.url).toBe('/api/kudos/k1/adjuntos/intencion');
    expect(llamadas[1]?.url).toBe(URL_ALMACENAMIENTO);
    expect(llamadas[2]?.url).toBe('/api/kudos/k1/adjuntos/a1/confirmar');
  });

  it('sube exactamente el archivo elegido, a la dirección que dio la API', async () => {
    const archivo = unArchivo('acta.pdf', 'application/pdf');
    const llamadas = fingirRed({
      '/adjuntos/intencion': permiso,
      '/adjuntos/kudos/': () => new Response(null, { status: 200 }),
      '/confirmar': () => new Response(null, { status: 204 }),
    });

    await subirAdjunto('k1', archivo);

    expect(llamadas[1]?.cuerpo).toBe(archivo);
    expect(llamadas[1]?.cabeceras['Content-Type']).toBe('application/pdf');
  });

  /**
   * **La que más importa de este archivo.** La subida va a otro servicio, y mandarle el token de
   * sesión de la plataforma sería filtrarlo. La URL prefirmada ya lleva su propia credencial.
   */
  it('no manda el token de la sesión al almacenamiento', async () => {
    guardarSesion({
      token: 'token-secreto-de-la-sesion',
      expiraEn: Date.now() + 3_600_000,
      nombre: 'Ana',
      personaId: 'p1',
    });

    const llamadas = fingirRed({
      '/adjuntos/intencion': permiso,
      '/adjuntos/kudos/': () => new Response(null, { status: 200 }),
      '/confirmar': () => new Response(null, { status: 204 }),
    });

    await subirAdjunto('k1', unArchivo('acta.pdf', 'application/pdf'));

    // Las llamadas a la API sí llevan el token...
    expect(llamadas[0]?.cabeceras['Authorization']).toBe('Bearer token-secreto-de-la-sesion');
    // ...y la subida al almacenamiento, no.
    expect(llamadas[1]?.cabeceras['Authorization']).toBeUndefined();
    expect(JSON.stringify(llamadas[1])).not.toContain('token-secreto');
  });

  it('dice qué archivo falló cuando la API rechaza pedir permiso, y no intenta subir nada', async () => {
    const llamadas = fingirRed({
      '/adjuntos/intencion': () =>
        new Response(
          JSON.stringify({ detail: 'Otra operación modificó este contenido al mismo tiempo.' }),
          { status: 409 },
        ),
    });

    await expect(subirAdjunto('k1', unArchivo('acta.pdf', 'application/pdf'))).rejects.toThrow(
      /«acta.pdf» no se pudo adjuntar: Otra operación modificó/,
    );

    // Sin permiso no hay URL a la que subir: la única llamada es la que falló.
    expect(llamadas).toHaveLength(1);
  });

  it('dice en qué paso falló cuando el almacenamiento rechaza la subida', async () => {
    fingirRed({
      '/adjuntos/intencion': permiso,
      '/adjuntos/kudos/': () => new Response('denegado', { status: 403 }),
    });

    await expect(subirAdjunto('k1', unArchivo('acta.pdf', 'application/pdf'))).rejects.toThrow(
      /acta\.pdf.*403/,
    );
  });

  it('no intenta confirmar si la subida falló', async () => {
    const llamadas = fingirRed({
      '/adjuntos/intencion': permiso,
      '/adjuntos/kudos/': () => new Response('error', { status: 500 }),
    });

    await expect(
      subirAdjunto('k1', unArchivo('acta.pdf', 'application/pdf')),
    ).rejects.toBeInstanceOf(Error);

    // Confirmar un archivo que no llegó solo produciría un error confuso.
    expect(llamadas.some((l) => l.url.includes('/confirmar'))).toBe(false);
  });

  it('enseña el motivo que da el servidor cuando el contenido real no es del tipo declarado', async () => {
    fingirRed({
      '/adjuntos/intencion': permiso,
      '/adjuntos/kudos/': () => new Response(null, { status: 200 }),
      '/confirmar': () =>
        new Response(
          JSON.stringify({
            detail: 'El tipo de archivo application/octet-stream no está permitido.',
          }),
          {
            status: 400,
          },
        ),
    });

    await expect(subirAdjunto('k1', unArchivo('falso.pdf', 'application/pdf'))).rejects.toThrow(
      /falso\.pdf.*no está permitido/,
    );
  });

  it('pide un enlace de descarga a la API y devuelve su dirección', async () => {
    fingirRed({
      '/descarga': () =>
        new Response(JSON.stringify({ url: 'https://x.test/adjuntos/k/a?X-Amz-Signature=z' })),
    });

    expect(await pedirEnlaceDeDescarga('k1', 'a1')).toBe(
      'https://x.test/adjuntos/k/a?X-Amz-Signature=z',
    );
  });
});
