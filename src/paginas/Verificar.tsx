import { type FormEvent, useId, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { ErrorDeApi, pedir } from '../api/cliente';
import type { EstadoRegistro } from '../api/tipos';

/**
 * Verificación del correo y del celular (RF-02).
 *
 * Es pública, como el registro. Cada dato lleva su propio código, de seis dígitos y diez minutos de
 * vigencia, y con cinco intentos por código. La cuenta solo queda activa cuando, además, su
 * aprobador aprueba la solicitud: verificar no basta, y aprobar tampoco.
 *
 * **Honestidad sobre el celular:** el código del celular llega por **correo**, no por WhatsApp.
 * Meta no permite crear plantillas de autenticación sin verificación comercial del negocio, así que
 * ese envío por WhatsApp está pendiente (ADR-0006). La pantalla lo dice tal cual.
 */
export function Verificar() {
  const [parametros] = useSearchParams();
  const id = useId();

  const [correo, setCorreo] = useState(parametros.get('correo') ?? '');
  const [estado, setEstado] = useState<EstadoRegistro | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  // Lo ya verificado se recuerda aunque la última respuesta sea de la otra verificación.
  const [correoVerificado, setCorreoVerificado] = useState(false);
  const [celularVerificado, setCelularVerificado] = useState(false);

  function alVerificar(nuevo: EstadoRegistro) {
    setEstado(nuevo);
    setCorreoVerificado((antes) => antes || nuevo.correoVerificado);
    setCelularVerificado((antes) => antes || nuevo.celularVerificado);
  }

  async function reenviar() {
    setMensaje(null);

    try {
      await pedir('/identidad/reenviar-codigos', {
        metodo: 'POST',
        cuerpo: { correoInstitucional: correo.trim() },
      });
      setMensaje('Si la solicitud existe, enviamos códigos nuevos. Pueden tardar un minuto.');
    } catch (causa) {
      setMensaje(causa instanceof ErrorDeApi ? causa.message : 'No se pudieron reenviar.');
    }
  }

  return (
    <>
      <h1>Verifica tu cuenta</h1>
      <p className="subtitulo">
        Te enviamos dos códigos a tu correo: uno para comprobar tu correo y otro para tu celular
        (por ahora el del celular también llega por correo). Cada uno vence en 10 minutos.
      </p>

      <div className="campo">
        <label htmlFor={`${id}-correo`}>Correo institucional</label>
        <input
          id={`${id}-correo`}
          type="email"
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          autoComplete="email"
        />
      </div>

      <FilaDeCodigo
        titulo="Código del correo"
        tipo="correo"
        correo={correo}
        verificado={correoVerificado}
        alVerificar={alVerificar}
      />

      <FilaDeCodigo
        titulo="Código del celular"
        tipo="celular"
        correo={correo}
        verificado={celularVerificado}
        alVerificar={alVerificar}
      />

      {correoVerificado && celularVerificado && (
        <div className="tarjeta tarjeta-kudo" role="status">
          <h2>Verificaciones completas</h2>
          <p>
            {estado?.solicitudAprobada === true
              ? 'Tu solicitud ya está aprobada: puedes entrar.'
              : 'Tu solicitud queda pendiente de aprobación por quien corresponde. Cuando la aprueben, te avisaremos por correo y podrás entrar.'}
          </p>
          <Link to="/" className="boton">
            Ir al inicio
          </Link>
        </div>
      )}

      <p className="meta">
        ¿No te llegó o venció?{' '}
        <button
          type="button"
          className="enlace"
          disabled={correo.trim() === ''}
          onClick={() => void reenviar()}
        >
          Pedir códigos nuevos
        </button>
      </p>

      {mensaje !== null && <p role="status">{mensaje}</p>}
    </>
  );
}

function FilaDeCodigo({
  titulo,
  tipo,
  correo,
  verificado,
  alVerificar,
}: {
  titulo: string;
  tipo: 'correo' | 'celular';
  correo: string;
  verificado: boolean;
  alVerificar: (estado: EstadoRegistro) => void;
}) {
  const id = useId();
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);

    try {
      alVerificar(
        await pedir<EstadoRegistro>('/identidad/verificar', {
          metodo: 'POST',
          cuerpo: { correoInstitucional: correo.trim(), tipo, codigo: codigo.trim() },
        }),
      );
    } catch (causa) {
      setError(causa instanceof ErrorDeApi ? causa.message : 'No se pudo verificar el código.');
    } finally {
      setEnviando(false);
    }
  }

  if (verificado) {
    return (
      <p className="exito" role="status">
        ✓ {titulo}: verificado
      </p>
    );
  }

  return (
    <form onSubmit={(e) => void enviar(e)} className="campo fila-codigo">
      <label htmlFor={id}>{titulo}</label>
      <div className="fila-codigo__controles">
        <input
          id={id}
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          pattern="[0-9]{6}"
          required
        />
        <button type="submit" disabled={enviando || correo.trim() === ''}>
          {enviando ? 'Verificando…' : 'Verificar'}
        </button>
      </div>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
