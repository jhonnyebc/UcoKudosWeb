import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  alCambiarLaSesion,
  cerrarSesion,
  guardarSesion,
  quienEstaDentro,
  reiniciarParaPruebas,
  tokenVigente,
} from './almacenDeSesion';

const DENTRO_DE_UNA_HORA = Date.now() + 3_600_000;

function unaSesion(expiraEn = DENTRO_DE_UNA_HORA) {
  return { token: 'el-token', expiraEn, nombre: 'Ana Gómez', personaId: 'auth0|123' };
}

describe('almacén de sesión', () => {
  beforeEach(() => {
    reiniciarParaPruebas();
  });

  it('entrega el token mientras la sesión es válida', () => {
    guardarSesion(unaSesion());

    expect(tokenVigente()).toBe('el-token');
  });

  it('sin sesión no hay token', () => {
    expect(tokenVigente()).toBeNull();
    expect(quienEstaDentro()).toBeNull();
  });

  /**
   * Una pestaña puede quedarse abierta horas. Comprobar la caducidad **al pedir el token**, y no
   * solo al recibirlo, es lo que evita mandar un token vencido: el 401 que vendría después el
   * usuario lo vería como un error raro en vez de como una sesión que expiró.
   */
  it('no entrega un token vencido y cierra la sesión', () => {
    guardarSesion(unaSesion(Date.now() - 1));

    expect(tokenVigente()).toBeNull();
    expect(quienEstaDentro()).toBeNull();
  });

  /**
   * Lo que la interfaz necesita para dibujarse **no incluye el token**. Es la frontera que hace que
   * el token no se filtre a un componente por descuido.
   */
  it('los datos para la interfaz no llevan el token', () => {
    guardarSesion(unaSesion());

    const quien = quienEstaDentro();

    expect(quien?.nombre).toBe('Ana Gómez');
    expect(quien).not.toHaveProperty('token');
  });

  /**
   * **Prueba de regresión de un fallo que dejaba la pantalla en blanco.**
   *
   * La interfaz se suscribe con `useSyncExternalStore`, que compara la instantánea con la anterior
   * **por identidad**, no por contenido. La primera versión construía un objeto nuevo en cada
   * llamada, así que React creía que la sesión cambiaba en cada dibujado y entraba en bucle hasta
   * abortar: el inicio de sesión funcionaba y la aplicación se quedaba en blanco al volver.
   *
   * Esta prueba faltaba, y por eso el fallo llegó al navegador: las demás comprueban los valores,
   * y el defecto no estaba en los valores sino en la identidad del objeto.
   */
  it('devuelve siempre la misma instancia mientras la sesión no cambia', () => {
    guardarSesion(unaSesion());

    expect(quienEstaDentro()).toBe(quienEstaDentro());
  });

  it('devuelve una instancia distinta cuando la sesión sí cambia', () => {
    guardarSesion(unaSesion());
    const primera = quienEstaDentro();

    guardarSesion({ ...unaSesion(), nombre: 'Luis Pérez' });

    expect(quienEstaDentro()).not.toBe(primera);
    expect(quienEstaDentro()?.nombre).toBe('Luis Pérez');
  });

  it('avisa a quien escucha cuando se entra y cuando se sale', () => {
    const escucha = vi.fn();
    alCambiarLaSesion(escucha);

    guardarSesion(unaSesion());
    expect(escucha).toHaveBeenCalledTimes(1);

    cerrarSesion();
    expect(escucha).toHaveBeenCalledTimes(2);
    expect(escucha).toHaveBeenLastCalledWith(null);
  });

  it('al vencer también avisa, para que la interfaz deje de mostrar la sesión', () => {
    guardarSesion(unaSesion(Date.now() - 1));

    const escucha = vi.fn();
    alCambiarLaSesion(escucha);

    tokenVigente();

    expect(escucha).toHaveBeenCalledWith(null);
  });

  it('dejar de escuchar funciona', () => {
    const escucha = vi.fn();
    const dejar = alCambiarLaSesion(escucha);

    dejar();
    guardarSesion(unaSesion());

    expect(escucha).not.toHaveBeenCalled();
  });

  /**
   * La propiedad central de ADR-0015 punto 6: el token no toca el almacenamiento del navegador.
   * Si alguien lo cambiara por comodidad, esta prueba lo diría.
   */
  it('no escribe nada en el almacenamiento del navegador', () => {
    const enLocal = vi.spyOn(Storage.prototype, 'setItem');

    guardarSesion(unaSesion());

    expect(enLocal).not.toHaveBeenCalled();
    enLocal.mockRestore();
  });
});
