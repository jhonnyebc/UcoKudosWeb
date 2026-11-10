import { lazy, Suspense } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';

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

export function App() {
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
      </nav>

      <main id="contenido" className="contenido" tabIndex={-1}>
        <Suspense fallback={<p role="status">Cargando…</p>}>
          <Routes>
            <Route path="/" element={<Muro />} />
            <Route path="/publicar" element={<PublicarKudo />} />
            <Route path="/avisos" element={<Avisos />} />
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
