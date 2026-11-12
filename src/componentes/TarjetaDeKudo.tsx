import type { KudoDelMuro } from '../api/tipos';
import { AdjuntosDeKudo } from './AdjuntosDeKudo';

/**
 * Un Kudo en el muro.
 *
 * El contenido se pinta como **texto**, nunca como HTML. React lo escapa por omisión y aquí no se
 * usa nada que lo evite: el texto lo escribe un usuario, así que tratarlo como marcado sería abrir
 * la puerta a que alguien inyecte código en la pantalla de los demás.
 */
export function TarjetaDeKudo({ kudo }: { kudo: KudoDelMuro }) {
  const fecha = new Date(kudo.publicadoEn);

  return (
    <article className="tarjeta">
      <h2>
        {kudo.autorNombre} reconoció a {kudo.destinatarioNombre}
      </h2>

      <p className="categoria">{kudo.categoriaNombre}</p>

      <p>{kudo.contenido}</p>

      {/* La fecha legible para la persona, y la exacta en el atributo para quien la necesite. */}
      <p className="meta">
        <time dateTime={kudo.publicadoEn}>{fechaLegible(fecha)}</time>

        {kudo.totalReplicas > 0 && (
          <span>
            {' · '}
            {kudo.totalReplicas} {kudo.totalReplicas === 1 ? 'respuesta' : 'respuestas'}
          </span>
        )}

        {kudo.totalCalificaciones > 0 && kudo.promedioCalificacion !== null && (
          <span>
            {' · '}
            {kudo.promedioCalificacion.toFixed(1)} de 5
            <span className="solo-lectores"> según {kudo.totalCalificaciones} calificaciones</span>
          </span>
        )}
      </p>

      {kudo.totalAdjuntos > 0 && <AdjuntosDeKudo kudoId={kudo.id} total={kudo.totalAdjuntos} />}
    </article>
  );
}

/**
 * Fecha en términos humanos para lo reciente, y completa para lo viejo.
 *
 * «Hace 3 h» dice más que una fecha cuando acaba de pasar, pero «hace 47 días» no dice nada: a
 * partir de una semana se muestra la fecha.
 */
function fechaLegible(fecha: Date, ahora: Date = new Date()): string {
  const minutos = Math.round((ahora.getTime() - fecha.getTime()) / 60000);

  if (minutos < 1) {
    return 'hace un momento';
  }

  if (minutos < 60) {
    return `hace ${minutos} min`;
  }

  const horas = Math.round(minutos / 60);
  if (horas < 24) {
    return `hace ${horas} h`;
  }

  const dias = Math.round(horas / 24);
  if (dias <= 7) {
    return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
  }

  return fecha.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}
