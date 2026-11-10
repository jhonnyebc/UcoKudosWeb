/**
 * Sacar al navegador de esta aplicación, en un solo sitio.
 *
 * Son dos líneas y tiene un módulo propio por una razón concreta: el flujo de autenticación manda
 * al usuario a otro dominio, y eso es justo lo que una prueba no puede dejar que ocurra de verdad.
 * Con la llamada aquí, la prueba sustituye este módulo y comprueba **a qué URL se habría ido**, que
 * es lo que importa verificar: que lleva el reto correcto y que nunca lleva el verificador.
 *
 * La alternativa era manipular el objeto `location` del navegador simulado, que no lo permite y
 * obliga a trucos que se rompen con cada actualización. Cuando algo cuesta de probar, casi siempre
 * es el código el que pide un cambio, no la prueba.
 */
export function irA(url: string): void {
  window.location.assign(url);
}
