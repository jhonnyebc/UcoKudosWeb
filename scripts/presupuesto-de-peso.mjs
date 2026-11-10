// Comprueba el presupuesto de peso de QA-MOV-01: la carga inicial, comprimida, por debajo de
// 300 KB.
//
// Esto existe para que «mobile first» sea una afirmación medida y no una intención. Un presupuesto
// que nadie comprueba se incumple en la tercera semana, sin que nadie se entere, porque ninguna
// biblioteca pesa mucho por sí sola: pesan todas juntas.
//
// Se mide lo que el navegador descarga para pintar la primera pantalla: el HTML, y los archivos
// que este referencia directamente. Los trozos que se cargan al navegar a otra pantalla NO cuentan
// aquí; ese es justamente el objetivo de la división de código.
import { gzipSync } from 'node:zlib';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SALIDA = 'dist';
const LIMITE_KB = 300;

if (!existsSync(join(SALIDA, 'index.html'))) {
  console.error(`No hay nada que medir en ${SALIDA}/. Ejecuta primero la construcción.`);
  process.exit(1);
}

const html = readFileSync(join(SALIDA, 'index.html'), 'utf8');

// Los archivos que el HTML pide por sí mismo: eso es la carga inicial.
const referencias = [...html.matchAll(/(?:src|href)="\/([^"]+\.(?:js|css))"/g)].map((m) => m[1]);

const archivos = [{ ruta: 'index.html', bytes: gzipSync(Buffer.from(html)).length }];

for (const referencia of referencias) {
  const ruta = join(SALIDA, referencia);
  if (existsSync(ruta)) {
    archivos.push({ ruta: referencia, bytes: gzipSync(readFileSync(ruta)).length });
  }
}

const total = archivos.reduce((suma, archivo) => suma + archivo.bytes, 0);
const totalKb = total / 1024;

console.log('Carga inicial, comprimida:\n');
for (const archivo of archivos.sort((a, b) => b.bytes - a.bytes)) {
  console.log(`  ${(archivo.bytes / 1024).toFixed(1).padStart(7)} KB  ${archivo.ruta}`);
}
console.log(`\n  ${totalKb.toFixed(1).padStart(7)} KB  TOTAL   (límite ${LIMITE_KB} KB)\n`);

if (totalKb > LIMITE_KB) {
  console.error(
    `Presupuesto incumplido: ${totalKb.toFixed(1)} KB supera los ${LIMITE_KB} KB de QA-MOV-01.`,
  );
  process.exit(1);
}

console.log(`Presupuesto cumplido, con ${(LIMITE_KB - totalKb).toFixed(1)} KB de margen.`);
