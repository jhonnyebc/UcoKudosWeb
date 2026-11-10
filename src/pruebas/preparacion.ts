import '@testing-library/jest-dom/vitest';
import { expect } from 'vitest';
import * as matchers from 'vitest-axe/matchers';

expect.extend(matchers);

/**
 * El observador de intersección no existe en el DOM simulado de las pruebas, y el muro lo usa para
 * el desplazamiento infinito. Se sustituye por uno que no hace nada: lo que se prueba aquí es lo
 * que se dibuja, no el comportamiento del navegador al desplazarse.
 */
class ObservadorInerte implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: readonly number[] = [];
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

globalThis.IntersectionObserver = ObservadorInerte as unknown as typeof IntersectionObserver;
