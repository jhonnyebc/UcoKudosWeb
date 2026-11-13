import { afterEach, describe, expect, it, vi } from 'vitest';

import { guardarSesion, reiniciarParaPruebas } from '../autenticacion/almacenDeSesion';
import {
  MAXIMO_POR_KUDO,
  TAMANO_MAXIMO_BYTES,
  descargarAdjunto,
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

  const permiso = () => new Response(JSON.stringify({ adjuntoId: 'a1' }), { status: 200 });

  const rutasFelices = () => ({
    '/adjuntos/intencion': permiso,
    '/adjuntos/a1/contenido': () => new Response(null, { status: 204 }),
    '/confirmar': () => new Response(null, { status: 204 }),
  });

  const sesion = () =>
    guardarSesion({
      token: 'token-de-la-sesion',
      expiraEn: Date.now() + 3_600_000,
      nombre: 'Ana',
      personaId: 'p1',
    });

  it('sigue los tres pasos en orden: reservar, subir el contenido y confirmar', async () => {
    const llamadas = fingirRed(rutasFelices());

    await subirAdjunto('k1', unArchivo('acta.pdf', 'application/pdf'));

    expect(llamadas.map((l) => l.metodo)).toEqual(['POST', 'PUT', 'POST']);
    expect(llamadas[0]?.url).toBe('/api/kudos/k1/adjuntos/intencion');
    expect(llamadas[1]?.url).toBe('/api/kudos/k1/adjuntos/a1/contenido');
    expect(llamadas[2]?.url).toBe('/api/kudos/k1/adjuntos/a1/confirmar');
  });

  it('sube exactamente el archivo elegido, con su tipo', async () => {
    const archivo = unArchivo('acta.pdf', 'application/pdf');
    const llamadas = fingirRed(rutasFelices());

    await subirAdjunto('k1', archivo);

    expect(llamadas[1]?.cuerpo).toBe(archivo);
    expect(llamadas[1]?.cabeceras['Content-Type']).toBe('application/pdf');
  });

  /**
   * **La que más importa de este archivo.** Los tres pasos van a la API y los tres llevan la
   * sesión: la API es la única que habla con el almacenamiento y necesita saber quién sube.
   */
  it('manda la sesión en los tres pasos, y todos van a la API', async () => {
    sesion();
    const llamadas = fingirRed(rutasFelices());

    await subirAdjunto('k1', unArchivo('acta.pdf', 'application/pdf'));

    for (const llamada of llamadas) {
      expect(llamada.url.startsWith('/api/')).toBe(true);
      expect(llamada.cabeceras['Authorization']).toBe('Bearer token-de-la-sesion');
    }
  });

  it('dice qué archivo falló cuando la API rechaza reservar, y no intenta subir nada', async () => {
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

    expect(llamadas).toHaveLength(1);
  });

  it('dice qué archivo y por qué cuando la API rechaza el contenido', async () => {
    fingirRed({
      '/adjuntos/intencion': permiso,
      '/adjuntos/a1/contenido': () =>
        new Response(JSON.stringify({ detail: 'El archivo supera el máximo permitido.' }), {
          status: 400,
        }),
    });

    await expect(subirAdjunto('k1', unArchivo('acta.pdf', 'application/pdf'))).rejects.toThrow(
      /acta.pdf.*supera el máximo/,
    );
  });

  it('no intenta confirmar si la subida falló', async () => {
    const llamadas = fingirRed({
      '/adjuntos/intencion': permiso,
      '/adjuntos/a1/contenido': () => new Response('error', { status: 500 }),
    });

    await expect(
      subirAdjunto('k1', unArchivo('acta.pdf', 'application/pdf')),
    ).rejects.toBeInstanceOf(Error);

    expect(llamadas.some((l) => l.url.includes('/confirmar'))).toBe(false);
  });

  it('enseña el motivo que da el servidor cuando el contenido real no es del tipo declarado', async () => {
    fingirRed({
      ...rutasFelices(),
      '/confirmar': () =>
        new Response(
          JSON.stringify({
            detail: 'El tipo de archivo application/octet-stream no está permitido.',
          }),
          { status: 400 },
        ),
    });

    await expect(subirAdjunto('k1', unArchivo('falso.pdf', 'application/pdf'))).rejects.toThrow(
      /falso.pdf.*no está permitido/,
    );
  });

  it('descarga el archivo con la sesión y lo devuelve como Blob', async () => {
    sesion();
    const llamadas = fingirRed({
      '/adjuntos/a1/archivo': () =>
        new Response('%PDF-1.7', { headers: { 'Content-Type': 'application/pdf' } }),
    });

    const blob = await descargarAdjunto('k1', 'a1');

    expect(llamadas[0]?.url).toBe('/api/kudos/k1/adjuntos/a1/archivo');
    expect(llamadas[0]?.cabeceras['Authorization']).toBe('Bearer token-de-la-sesion');
    expect(blob.size).toBe('%PDF-1.7'.length);
    expect(blob.type).toBe('application/pdf');
  });
});
