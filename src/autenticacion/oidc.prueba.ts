import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { iniciarSesion, procesarRetorno } from './oidc';
import { quienEstaDentro, reiniciarParaPruebas } from './almacenDeSesion';
import { irA } from './navegacion';

// Se sustituye la navegación real: una prueba no puede irse a otro dominio. Lo que se comprueba es
// a qué URL se habría ido.
vi.mock('./navegacion', () => ({ irA: vi.fn() }));

const EMISOR = 'https://identidad.ejemplo';
const CLIENTE = 'cliente-de-prueba';

/** La URL a la que el módulo mandó al navegador en la última llamada. */
function ultimoDestino(): string | null {
  const llamadas = vi.mocked(irA).mock.calls;
  return llamadas.length === 0 ? null : (llamadas[llamadas.length - 1]?.[0] ?? null);
}

describe('flujo OIDC con PKCE', () => {
  beforeEach(() => {
    reiniciarParaPruebas();
    sessionStorage.clear();
    vi.mocked(irA).mockClear();

    vi.stubEnv('VITE_IDENTIDAD_EMISOR', EMISOR);
    vi.stubEnv('VITE_IDENTIDAD_CLIENTE', CLIENTE);
    vi.stubEnv('VITE_IDENTIDAD_AUDIENCIA', 'https://api.ejemplo');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('manda al proveedor con los parámetros que exige el estándar', async () => {
    await iniciarSesion('/publicar');

    const destino = ultimoDestino();
    expect(destino).not.toBeNull();
    const url = new URL(destino!);

    expect(url.origin + url.pathname).toBe(`${EMISOR}/authorize`);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe(CLIENTE);
    expect(url.searchParams.get('scope')).toContain('openid');

    // S256 y nunca «plain»: con «plain» se enviaría el secreto tal cual y PKCE no protegería nada.
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9\-_]{43}$/);
    expect(url.searchParams.get('state')).toBeTruthy();
  });

  /**
   * El verificador **no** puede viajar al proveedor: si lo hiciera, quien interceptara esa petición
   * tendría el secreto y PKCE dejaría de servir. Solo viaja su huella.
   */
  it('no envía nunca el verificador al proveedor', async () => {
    await iniciarSesion('/');

    const verificador = sessionStorage.getItem('ucokudos.pkce.verificador');

    expect(verificador).toBeTruthy();
    expect(ultimoDestino()).not.toContain(verificador!);
  });

  it('recuerda dónde estaba el usuario para devolverlo ahí', async () => {
    await iniciarSesion('/publicar');

    expect(sessionStorage.getItem('ucokudos.pkce.destino')).toBe('/publicar');
  });

  /**
   * **La prueba de seguridad del retorno.** Si el estado no coincide, esta respuesta no pertenece a
   * un inicio de sesión que haya empezado esta aplicación: hay que descartarla **sin canjear el
   * código**. Por eso se comprueba que no se hizo ni una sola petición de red.
   */
  it('con un estado que no coincide no canjea el código', async () => {
    const red = vi.spyOn(globalThis, 'fetch');

    await iniciarSesion('/');

    const resultado = await procesarRetorno('?code=robado&state=estado-inventado');

    expect(resultado.exito).toBe(false);
    expect(red).not.toHaveBeenCalled();
    expect(quienEstaDentro()).toBeNull();
  });

  it('sin haber iniciado el flujo tampoco canjea nada', async () => {
    const red = vi.spyOn(globalThis, 'fetch');

    const resultado = await procesarRetorno('?code=suelto&state=cualquiera');

    expect(resultado.exito).toBe(false);
    expect(red).not.toHaveBeenCalled();
  });

  it('traduce la cancelación del usuario a un mensaje suyo, no a un error técnico', async () => {
    await iniciarSesion('/');

    const resultado = await procesarRetorno('?error=access_denied');

    expect(resultado.exito).toBe(false);
    expect(resultado.error).toBe('Cancelaste el inicio de sesión.');
  });

  /**
   * El camino feliz: estado correcto, código canjeado y sesión abierta. Comprueba además que el
   * verificador se envía **en el canje**, que es el único momento en que debe salir.
   */
  it('con el estado correcto canja el código y abre la sesión', async () => {
    // Se codifica como lo hace un proveedor real: a bytes UTF-8 y de ahí a base64url. Con `btoa`
    // sobre el texto directamente, un nombre con tilde se rompe en la propia prueba.
    const base64url = (t: string) => {
      let binario = '';
      for (const byte of new TextEncoder().encode(t)) {
        binario += String.fromCharCode(byte);
      }
      return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    };
    const idToken = [
      base64url('{"alg":"RS256"}'),
      base64url(JSON.stringify({ sub: 'auth0|7', name: 'Ana Gómez', exp: 2_000_000_000 })),
      'firma',
    ].join('.');

    let cuerpoDelCanje = '';

    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, opciones) => {
      cuerpoDelCanje = typeof opciones?.body === 'string' ? opciones.body : '';
      return Promise.resolve(
        new Response(JSON.stringify({ access_token: 'token-de-acceso', id_token: idToken }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    await iniciarSesion('/publicar');
    const verificador = sessionStorage.getItem('ucokudos.pkce.verificador')!;
    const estado = sessionStorage.getItem('ucokudos.pkce.estado')!;

    const resultado = await procesarRetorno(`?code=el-codigo&state=${encodeURIComponent(estado)}`);

    expect(resultado.exito).toBe(true);
    expect(resultado.destino).toBe('/publicar');
    // Se compara el valor ya decodificado, no el texto crudo: el cuerpo va codificado como
    // formulario y caracteres válidos del verificador, como `~`, viajan escapados. Comparar las
    // cadenas sin decodificar hacía que esta prueba fallara solo a veces, según qué verificador
    // aleatorio saliera, que es la peor forma de fallar.
    const enviado = new URLSearchParams(cuerpoDelCanje);
    expect(enviado.get('code_verifier')).toBe(verificador);
    expect(enviado.get('grant_type')).toBe('authorization_code');
    expect(enviado.get('code')).toBe('el-codigo');
    expect(quienEstaDentro()?.nombre).toBe('Ana Gómez');
  });

  /**
   * El verificador y el estado son de **un solo uso**. Si sobrevivieran al canje, una página de
   * retorno recargada intentaría canjear otra vez un código ya gastado.
   */
  it('borra el verificador y el estado después de usarlos', async () => {
    await iniciarSesion('/');
    await procesarRetorno('?error=access_denied');

    expect(sessionStorage.getItem('ucokudos.pkce.verificador')).toBeNull();
    expect(sessionStorage.getItem('ucokudos.pkce.estado')).toBeNull();
  });
});
