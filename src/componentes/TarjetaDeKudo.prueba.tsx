import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import type { KudoDelMuro } from '../api/tipos';
import { TarjetaDeKudo } from './TarjetaDeKudo';

function unKudo(cambios: Partial<KudoDelMuro> = {}): KudoDelMuro {
  return {
    id: '0193a000-0000-7000-8000-000000000001',
    autorId: '0193a000-0000-7000-8000-00000000000a',
    autorNombre: 'Ana Gómez',
    destinatarioId: '0193a000-0000-7000-8000-00000000000b',
    destinatarioNombre: 'Luis Pérez',
    categoriaId: '0193a000-0000-7000-8000-00000000000c',
    categoriaNombre: 'Trabajo en Equipo',
    contenido: 'Gracias por quedarte a terminar el informe.',
    totalReplicas: 0,
    promedioCalificacion: null,
    totalCalificaciones: 0,
    totalAdjuntos: 0,
    publicadoEn: new Date().toISOString(),
    ...cambios,
  };
}

describe('TarjetaDeKudo', () => {
  it('dice quién reconoció a quién, en qué categoría y por qué', () => {
    render(<TarjetaDeKudo kudo={unKudo()} />);

    expect(screen.getByText(/Ana Gómez reconoció a Luis Pérez/)).toBeInTheDocument();
    expect(screen.getByText('Trabajo en Equipo')).toBeInTheDocument();
    expect(screen.getByText(/quedarte a terminar el informe/)).toBeInTheDocument();
  });

  /**
   * El texto lo escribe un usuario. Si se pintara como HTML, cualquiera podría inyectar código en
   * la pantalla de los demás. Esta prueba comprueba que se ve como texto literal.
   */
  it('no interpreta el contenido como HTML', () => {
    const malicioso = '<img src=x onerror="robar()"> hola';
    const { container } = render(<TarjetaDeKudo kudo={unKudo({ contenido: malicioso })} />);

    expect(screen.getByText(malicioso)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('usa singular y plural correctamente', () => {
    const { rerender } = render(<TarjetaDeKudo kudo={unKudo({ totalReplicas: 1 })} />);
    expect(screen.getByText(/1 respuesta$/)).toBeInTheDocument();

    rerender(<TarjetaDeKudo kudo={unKudo({ totalReplicas: 4 })} />);
    expect(screen.getByText(/4 respuestas$/)).toBeInTheDocument();
  });

  it('da la fecha también en formato legible por máquina', () => {
    const publicadoEn = '2026-11-01T15:30:00.000Z';
    render(<TarjetaDeKudo kudo={unKudo({ publicadoEn })} />);

    const tiempo = screen.getByText(/noviembre/);
    expect(tiempo).toHaveAttribute('datetime', publicadoEn);
  });

  /**
   * La comprobación de accesibilidad que pide ADR-0015. Falla si se introduce un control sin
   * nombre accesible o una estructura que un lector de pantalla no puede recorrer.
   *
   * **La regla de contraste está desactivada aquí, y no por conveniencia.** El DOM simulado de las
   * pruebas no pinta nada, así que axe no puede medir colores: intentarlo lanza un error de lienzo
   * no implementado y la regla se omite **en silencio**. Dejarla activada sería peor que quitarla,
   * porque la prueba pasaría en verde dando a entender que el contraste se comprobó.
   *
   * El contraste se verifica donde se puede medir de verdad: en un navegador real, con las pruebas
   * de punta a punta de la Fase 3. Esto queda anotado como lo que es, un hueco con su sitio
   * asignado, y no tapado.
   */
  it('no tiene problemas de accesibilidad detectables en la estructura', async () => {
    const { container } = render(<TarjetaDeKudo kudo={unKudo()} />);

    const resultado = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    });

    expect(resultado).toHaveNoViolations();
  });
});
