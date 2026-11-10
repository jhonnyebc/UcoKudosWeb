import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { App } from './App';
import { AvisoDeNuevaVersion } from './componentes/AvisoDeNuevaVersion';
import { AvisosEnVivo } from './componentes/AvisosEnVivo';
import './estilos/global.css';

const raiz = document.getElementById('raiz');

if (raiz === null) {
  throw new Error('Falta el elemento raíz en index.html.');
}

createRoot(raiz).render(
  <StrictMode>
    <BrowserRouter>
      <App />
      <AvisosEnVivo />
      <AvisoDeNuevaVersion />
    </BrowserRouter>
  </StrictMode>,
);
