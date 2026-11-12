import { lazy, Suspense } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';

import { useRestaurarSesion } from './autenticacion/useRestaurarSesion';
import { BarraDeSesion } from './componentes/BarraDeSesion';
import { ExigeSesion } from './componentes/ExigeSesion';
import { Muro } from './paginas/Muro';

/**
 * El armazón de la aplicación.
 *
 * El muro se carga de entrada porque es la primera pantalla y partirlo solo añadiría una ida y
 * vuelta a la red justo en el momento que mide QA-MOV-01. El resto se carga cuando hace falta:
 * es la división de código con la que el presupuesto de 300 KB se sostiene mientras la aplicación
 * crece.
 */
const PublicarKudo = lazy(() =>
  import('./paginas/PublicarKudo').then((m) => ({ default: m.PublicarKudo })),
);
const Avisos = lazy(() => import('./paginas/Avisos').then((m) => ({ default: m.Avisos })));
const Retorno = lazy(() => import('./paginas/Retorno').then((m) => ({ default: m.Retorno })));
const Auditoria = lazy(() => import('./paginas/Auditoria').then((m) => ({ default: m.Auditoria })));

export function App() {
  const restaurando = useRestaurarSesion();

  if (restaurando) {
    // Mientras se recupera la sesión no se dibuja el contenido: enseñar "necesitas iniciar sesión"
    // a quien la tiene, y cambiarlo un segundo después, se lee como un fallo aunque no lo sea.
    return (
      <main className="contenido">
        <p role="status">Recuperando tu sesión…</p>
      </main>
    );
  }

  return (
    <>
      <a className="saltar-al-contenido" href="#contenido">
        Saltar al contenido
      </a>

      <nav className="navegacion" aria-label="Principal">
        <NavLink to="/" end>
          Muro
        </NavLink>
        <NavLink to="/publicar">Publicar</NavLink>
        <NavLink to="/avisos">Avisos</NavLink>
        <NavLink to="/auditoria">Auditoría</NavLink>
      </nav>

      <main id="contenido" className="contenido" tabIndex={-1}>
        <BarraDeSesion />

        <Suspense fallback={<p role="status">Cargando…</p>}>
          <Routes>
            {/* El muro también exige sesión, porque la API lo exige: es una plataforma interna de
                la universidad, no un tablón público. Sin esto, quien entra por primera vez recibe
                un «tu sesión expiró» por un 401, y nunca tuvo sesión que expirara. */}
            <Route
              path="/"
              element={
                <ExigeSesion que="ver el muro">
                  <Muro />
                </ExigeSesion>
              }
            />

            <Route
              path="/publicar"
              element={
                <ExigeSesion que="publicar un reconocimiento">
                  <PublicarKudo />
                </ExigeSesion>
              }
            />

            <Route
              path="/avisos"
              element={
                <ExigeSesion que="ver tus avisos">
                  <Avisos />
                </ExigeSesion>
              }
            />

            <Route
              path="/auditoria"
              element={
                <ExigeSesion que="verificar la auditoría">
                  <Auditoria />
                </ExigeSesion>
              }
            />

            <Route path="/retorno" element={<Retorno />} />
            <Route path="*" element={<NoEncontrada />} />
          </Routes>
        </Suspense>
      </main>
    </>
  );
}

function NoEncontrada() {
  return (
    <>
      <h1>Esta página no existe</h1>
      <p>Puede que el enlace esté mal o que el contenido se haya retirado.</p>
    </>
  );
}
