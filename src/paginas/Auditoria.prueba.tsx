import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { Auditoria } from './Auditoria';

function responder(estado: number, cuerpo: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(cuerpo), {
          status: estado,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ),
  );
}

async function verificar() {
  await userEvent.click(screen.getByRole('button', { name: /verificar/i }));
}

describe('Auditoría', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('no consulta hasta que se pulsa', () => {
    const espia = vi.fn();
    vi.stubGlobal('fetch', espia);

    render(<Auditoria />);

    // Recorrer la cadena cuesta en proporción al número de eventos: no se paga por pasar por aquí.
    expect(espia).not.toHaveBeenCalled();
  });

  it('dice que la cadena está íntegra y cuántos eventos revisó', async () => {
    responder(200, {
      eventosRevisados: 42,
      intacta: true,
      primerEventoAlterado: null,
      detalle: 'La cadena es consistente.',
    });

    render(<Auditoria />);
    await verificar();

    expect(await screen.findByText('Cadena íntegra')).toBeDefined();
    expect(screen.getByText('42')).toBeDefined();
  });

  it('señala el primer evento alterado cuando la cadena no cuadra', async () => {
    responder(200, {
      eventosRevisados: 42,
      intacta: false,
      primerEventoAlterado: 17,
      detalle: 'El hash del evento 17 no corresponde a sus datos.',
    });

    render(<Auditoria />);
    await verificar();

    expect(await screen.findByText('Cadena alterada')).toBeDefined();
    expect(screen.getByText('17')).toBeDefined();
  });

  /**
   * Que un rol sin permiso vea el motivo exacto no es un fallo de la pantalla: es la prueba de
   * que la autorización se aplica en el servidor. Enseñar «no se pudo verificar» a secas haría
   * parecer rota una regla que está funcionando.
   */
  it('enseña el motivo cuando el rol no puede consultar la auditoría', async () => {
    responder(403, { detail: 'El rol Docente no consulta la auditoría.' });

    render(<Auditoria />);
    await verificar();

    expect(await screen.findByText('El rol Docente no consulta la auditoría.')).toBeDefined();
  });

  it('no tiene problemas de accesibilidad detectables en la estructura', async () => {
    responder(200, {
      eventosRevisados: 42,
      intacta: true,
      primerEventoAlterado: null,
      detalle: 'La cadena es consistente.',
    });

    const { container } = render(<Auditoria />);
    await verificar();
    await screen.findByText('Cadena íntegra');

    const resultado = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    });

    expect(resultado).toHaveNoViolations();
  });
});
