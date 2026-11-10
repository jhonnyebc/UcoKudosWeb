import { describe, expect, it } from 'vitest';

import { calcularReto, generarEstado, generarVerificador, leerTokenSinValidar } from './pkce';

describe('PKCE', () => {
  it('genera verificadores con la longitud y el alfabeto que exige el estándar', () => {
    const verificador = generarVerificador();

    expect(verificador).toHaveLength(64);
    expect(verificador.length).toBeGreaterThanOrEqual(43);
    expect(verificador).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  /**
   * Dos verificadores iguales significarían que la aleatoriedad no es tal, y con eso PKCE deja de
   * proteger nada. Es la propiedad de la que depende todo lo demás.
   */
  it('no repite verificadores', () => {
    const generados = new Set(Array.from({ length: 200 }, () => generarVerificador()));

    expect(generados.size).toBe(200);
  });

  it('no repite estados', () => {
    const generados = new Set(Array.from({ length: 200 }, () => generarEstado()));

    expect(generados.size).toBe(200);
  });

  /**
   * El vector de prueba del propio estándar (RFC 7636). Comprobar contra él es lo que garantiza
   * que el reto se calcula como el proveedor espera y no «de una forma parecida».
   */
  it('calcula el reto igual que el ejemplo del estándar', async () => {
    const verificador = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

    const reto = await calcularReto(verificador);

    expect(reto).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('el reto va en base64url, sin relleno ni caracteres que haya que escapar', async () => {
    const reto = await calcularReto(generarVerificador());

    expect(reto).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(reto).not.toContain('=');
  });

  /** El reto es una huella: del mismo verificador sale siempre el mismo. */
  it('el mismo verificador da siempre el mismo reto', async () => {
    const verificador = generarVerificador();

    expect(await calcularReto(verificador)).toBe(await calcularReto(verificador));
  });
});

describe('leerTokenSinValidar', () => {
  function tokenCon(carga: Record<string, unknown>): string {
    const base64url = (texto: string) =>
      btoa(texto).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    return `${base64url('{"alg":"RS256"}')}.${base64url(JSON.stringify(carga))}.firma`;
  }

  it('saca el identificador, el nombre y la caducidad', () => {
    const datos = leerTokenSinValidar(tokenCon({ sub: 'auth0|123', name: 'Ana Gómez', exp: 1800 }));

    expect(datos).not.toBeNull();
    expect(datos?.sub).toBe('auth0|123');
    expect(datos?.nombre).toBe('Ana Gómez');

    // Llega en segundos y el resto del cliente trabaja en milisegundos.
    expect(datos?.expiraEn).toBe(1_800_000);
  });

  it('si no hay nombre usa el identificador, para no dejar la interfaz en blanco', () => {
    const datos = leerTokenSinValidar(tokenCon({ sub: 'auth0|123', exp: 1800 }));

    expect(datos?.nombre).toBe('auth0|123');
  });

  /**
   * Un token mal formado no debe tumbar la aplicación: devuelve null y el flujo lo trata como un
   * inicio de sesión fallido, que es lo que es.
   */
  it('devuelve null ante basura en lugar de reventar', () => {
    expect(leerTokenSinValidar('no-es-un-token')).toBeNull();
    expect(leerTokenSinValidar('a.b.c')).toBeNull();
    expect(leerTokenSinValidar('')).toBeNull();
  });

  it('devuelve null si falta el identificador del usuario', () => {
    expect(leerTokenSinValidar(tokenCon({ name: 'Sin sub', exp: 1800 }))).toBeNull();
  });
});
