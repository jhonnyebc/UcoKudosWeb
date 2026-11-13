import logoUco from '../assets/logo-uco.jpg';
import { BarraDeSesion } from './BarraDeSesion';
import { MarcaKudos } from './MarcaKudos';

/**
 * La cabecera: el escudo de la universidad, la marca de Kudos y quién está dentro.
 *
 * El logo de la UCO viene con mucho margen blanco alrededor; el recorte se hace con CSS
 * (`.logo-uco`) para no tocar el archivo original ni perder su calidad.
 */
export function Cabecera() {
  return (
    <header className="cabecera">
      <div className="cabecera__marcas">
        <span className="logo-uco">
          <img src={logoUco} alt="Universidad Católica de Oriente" width="501" height="501" />
        </span>

        <span className="cabecera__separador" aria-hidden="true" />

        <MarcaKudos />
      </div>

      <BarraDeSesion />
    </header>
  );
}
