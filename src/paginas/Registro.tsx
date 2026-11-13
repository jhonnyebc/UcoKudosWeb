import { type FormEvent, useEffect, useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ErrorDeApi, pedir } from '../api/cliente';
import type { Facultad, RolDelCatalogo } from '../api/tipos';

/**
 * Solicitud de cuenta (RF-01).
 *
 * El rol se **solicita**, no se elige a voluntad: la cuenta queda pendiente hasta que su aprobador
 * la apruebe y se verifiquen el correo y el celular (RF-02, RF-03). Esta pantalla es pública porque
 * quien se registra todavía no tiene cuenta con la que entrar.
 */
export function Registro() {
  const navegar = useNavigate();
  const id = useId();

  const [facultades, setFacultades] = useState<readonly Facultad[]>([]);
  const [roles, setRoles] = useState<readonly RolDelCatalogo[]>([]);
  const [errorDeCarga, setErrorDeCarga] = useState<string | null>(null);

  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [celular, setCelular] = useState('+57');
  const [rolId, setRolId] = useState('');
  const [facultadId, setFacultadId] = useState('');
  const [programaId, setProgramaId] = useState('');

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    async function cargar() {
      try {
        const [f, r] = await Promise.all([
          pedir<Facultad[]>('/identidad/estructura'),
          pedir<RolDelCatalogo[]>('/identidad/roles'),
        ]);

        if (!cancelado) {
          setFacultades(f);
          setRoles(r);
          setRolId(String(r.find((x) => x.nombre === 'Estudiante')?.id ?? r[0]?.id ?? ''));
        }
      } catch (causa) {
        if (!cancelado) {
          setErrorDeCarga(
            causa instanceof ErrorDeApi ? causa.message : 'No se pudo cargar el formulario.',
          );
        }
      }
    }

    void cargar();
    return () => {
      cancelado = true;
    };
  }, []);

  const rol = roles.find((r) => String(r.id) === rolId);
  const pideFacultad = rol?.ambito === 'Facultad' || rol?.ambito === 'Programa';
  const pidePrograma = rol?.ambito === 'Programa';
  const programas = facultades.find((f) => f.id === facultadId)?.programas ?? [];

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);

    try {
      await pedir('/identidad/registro', {
        metodo: 'POST',
        cuerpo: {
          correoInstitucional: correo.trim(),
          celular: celular.trim(),
          nombreCompleto: nombre.trim(),
          rolSolicitado: Number(rolId),
          facultadId: pideFacultad && facultadId !== '' ? facultadId : null,
          programaId: pidePrograma && programaId !== '' ? programaId : null,
        },
      });

      // Siguiente paso: verificar el correo y el celular con los códigos que acaban de salir.
      void navegar(`/verificar?correo=${encodeURIComponent(correo.trim())}`);
    } catch (causa) {
      setError(causa instanceof ErrorDeApi ? causa.message : 'No se pudo enviar la solicitud.');
    } finally {
      setEnviando(false);
    }
  }

  if (errorDeCarga !== null) {
    return (
      <>
        <h1>Solicitar una cuenta</h1>
        <p className="error" role="alert">
          {errorDeCarga}
        </p>
      </>
    );
  }

  return (
    <>
      <h1>Solicitar una cuenta</h1>
      <p className="subtitulo">
        Tu solicitud la revisa quien corresponde según tu rol. Te pediremos verificar tu correo y tu
        celular.
      </p>

      <form onSubmit={(e) => void enviar(e)} className="formulario">
        <div className="campo">
          <label htmlFor={`${id}-nombre`}>Nombre completo</label>
          <input
            id={`${id}-nombre`}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoComplete="name"
            required
          />
        </div>

        <div className="campo">
          <label htmlFor={`${id}-correo`}>Correo institucional</label>
          <input
            id={`${id}-correo`}
            type="email"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            autoComplete="email"
            required
          />
        </div>

        <div className="campo">
          <label htmlFor={`${id}-celular`}>Celular, con indicativo</label>
          <input
            id={`${id}-celular`}
            type="tel"
            value={celular}
            onChange={(e) => setCelular(e.target.value)}
            autoComplete="tel"
            required
          />
        </div>

        <div className="campo">
          <label htmlFor={`${id}-rol`}>Rol que solicitas</label>
          <select
            id={`${id}-rol`}
            value={rolId}
            onChange={(e) => setRolId(e.target.value)}
            required
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
        </div>

        {pideFacultad && (
          <div className="campo">
            <label htmlFor={`${id}-facultad`}>Facultad</label>
            <select
              id={`${id}-facultad`}
              value={facultadId}
              onChange={(e) => {
                setFacultadId(e.target.value);
                setProgramaId('');
              }}
              required
            >
              <option value="">Elige una facultad</option>
              {facultades.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nombre}
                </option>
              ))}
            </select>
          </div>
        )}

        {pidePrograma && (
          <div className="campo">
            <label htmlFor={`${id}-programa`}>Programa académico</label>
            <select
              id={`${id}-programa`}
              value={programaId}
              onChange={(e) => setProgramaId(e.target.value)}
              disabled={facultadId === ''}
              required
            >
              <option value="">Elige un programa</option>
              {programas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
        )}

        {error !== null && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="boton-grande" disabled={enviando || roles.length === 0}>
          {enviando ? 'Enviando…' : 'Solicitar cuenta'}
        </button>

        <p className="meta">
          ¿Ya enviaste tu solicitud? <Link to="/verificar">Verifica tus códigos</Link>.
        </p>
      </form>
    </>
  );
}
