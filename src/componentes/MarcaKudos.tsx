/**
 * La marca de UCO Kudos: una insignia con la estrella de cuatro puntas que ya lleva el escudo de la
 * universidad, y el nombre al lado.
 *
 * Es SVG dibujado a mano y no una imagen: pesa unos cientos de bytes, se ve nítido en cualquier
 * densidad de pantalla y toma sus colores de las variables de la aplicación. La insignia es
 * decorativa (`aria-hidden`); el nombre en texto es lo que lee un lector de pantalla.
 */
export function MarcaKudos({ grande = false }: { grande?: boolean }) {
  return (
    <span className={grande ? 'marca-kudos marca-kudos--grande' : 'marca-kudos'}>
      <svg
        className="marca-kudos__insignia"
        viewBox="0 0 48 48"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id="marca-kudos-fondo" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#12794d" />
            <stop offset="1" stopColor="#084a2d" />
          </linearGradient>
        </defs>

        <rect width="48" height="48" rx="12" fill="url(#marca-kudos-fondo)" />

        {/* La estrella grande, dorada, como la del escudo. */}
        <path
          d="M24 5 L28.2 19.8 L43 24 L28.2 28.2 L24 43 L19.8 28.2 L5 24 L19.8 19.8 Z"
          fill="#f5c518"
        />

        {/* Un destello blanco encima: el «reconocimiento» que brilla. */}
        <path
          d="M24 14 L26 22 L34 24 L26 26 L24 34 L22 26 L14 24 L22 22 Z"
          fill="#ffffff"
          opacity="0.92"
        />
      </svg>

      <span className="marca-kudos__texto">
        <span className="marca-kudos__nombre">Kudos</span>
        <span className="marca-kudos__lema">Reconocimientos UCO</span>
      </span>
    </span>
  );
}
