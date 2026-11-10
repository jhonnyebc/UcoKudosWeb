// Genera los iconos de la PWA.
//
// Se dibujan por código en lugar de guardar dos imágenes binarias en el repositorio, y hay una
// razón práctica detrás: un PNG en git es una caja negra. Nadie puede ver en una revisión qué
// cambió, ni regenerarlo en otro tamaño sin abrir un editor. Así el icono es texto, se revisa como
// cualquier otro cambio y añadir un tamaño nuevo es una línea.
//
// El PNG se escribe a mano porque no hace falta más: es un color de fondo y una letra. Traer una
// biblioteca de imágenes para esto sería cargar el proyecto con una dependencia que se usa una vez.
//
// Uso:  node scripts/generar-iconos.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const VERDE = [11, 93, 59]; // #0b5d3b, el mismo de los estilos
const BLANCO = [255, 255, 255];

const SALIDA = 'public';
const TAMANOS = [192, 512];

const TABLA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

mkdirSync(SALIDA, { recursive: true });

for (const lado of TAMANOS) {
  writeFileSync(join(SALIDA, `icono-${lado}.png`), png(dibujar(lado), lado, lado));
  console.log(`icono-${lado}.png`);
}

/**
 * Dibuja la letra K en blanco sobre el verde institucional.
 *
 * El margen generoso no es estético: en Android el sistema recorta el icono a la forma que use el
 * lanzador, y lo que queda fuera de un círculo centrado desaparece. Con la letra en el 60 % central
 * sobrevive a cualquier recorte.
 */
function dibujar(lado) {
  const pixeles = new Uint8Array(lado * lado * 3);

  for (let i = 0; i < lado * lado; i++) {
    pixeles[i * 3] = VERDE[0];
    pixeles[i * 3 + 1] = VERDE[1];
    pixeles[i * 3 + 2] = VERDE[2];
  }

  const grosor = Math.round(lado * 0.085);
  const arriba = Math.round(lado * 0.26);
  const abajo = Math.round(lado * 0.74);
  const izquierda = Math.round(lado * 0.3);
  const derecha = Math.round(lado * 0.7);
  const medio = Math.round((arriba + abajo) / 2);

  const punto = (x, y) => {
    for (let dy = -grosor / 2; dy <= grosor / 2; dy++) {
      for (let dx = -grosor / 2; dx <= grosor / 2; dx++) {
        const px = Math.round(x + dx);
        const py = Math.round(y + dy);
        if (px < 0 || py < 0 || px >= lado || py >= lado) continue;
        const i = (py * lado + px) * 3;
        pixeles[i] = BLANCO[0];
        pixeles[i + 1] = BLANCO[1];
        pixeles[i + 2] = BLANCO[2];
      }
    }
  };

  const linea = (x1, y1, x2, y2) => {
    const pasos = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    for (let p = 0; p <= pasos; p++) {
      punto(x1 + ((x2 - x1) * p) / pasos, y1 + ((y2 - y1) * p) / pasos);
    }
  };

  linea(izquierda, arriba, izquierda, abajo); // el tronco
  linea(izquierda, medio, derecha, arriba); // el brazo de arriba
  linea(izquierda, medio, derecha, abajo); // el brazo de abajo

  return pixeles;
}

/** Arma un PNG de color verdadero a partir de los píxeles. */
function png(pixeles, ancho, alto) {
  // Cada fila lleva delante un byte de filtro; 0 significa «sin filtro».
  const crudo = Buffer.alloc(alto * (ancho * 3 + 1));
  for (let y = 0; y < alto; y++) {
    crudo[y * (ancho * 3 + 1)] = 0;
    Buffer.from(pixeles.subarray(y * ancho * 3, (y + 1) * ancho * 3)).copy(
      crudo,
      y * (ancho * 3 + 1) + 1,
    );
  }

  const cabecera = Buffer.alloc(13);
  cabecera.writeUInt32BE(ancho, 0);
  cabecera.writeUInt32BE(alto, 4);
  cabecera[8] = 8; // bits por canal
  cabecera[9] = 2; // color verdadero, sin canal alfa

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', cabecera),
    trozo('IDAT', deflateSync(crudo)),
    trozo('IEND', Buffer.alloc(0)),
  ]);
}

function trozo(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length, 0);

  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const suma = Buffer.alloc(4);
  suma.writeUInt32BE(crc32(cuerpo), 0);

  return Buffer.concat([largo, cuerpo, suma]);
}

function crc32(datos) {
  let c = 0xffffffff;
  for (const byte of datos) {
    c = TABLA_CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}
