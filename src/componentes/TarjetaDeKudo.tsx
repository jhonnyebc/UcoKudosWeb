import { useState } from 'react';
import { Link } from 'react-router-dom';

import type { KudoDelMuro } from '../api/tipos';
import { AccionesDeModeracion } from './AccionesDeModeracion';
import { AdjuntosDeKudo } from './AdjuntosDeKudo';
import { Calificador } from './Calificador';
import { HiloDeKudo } from './HiloDeKudo';

/**
 * Un Kudo en el muro.
 *
 * El contenido se pinta como **texto**, nunca como HTML. React lo escapa por omisión y aquí no se
 * usa nada que lo evite: el texto lo escribe un usuario, así que tratarlo como marcado sería abrir
 * la puerta a que alguien inyecte código en la pantalla de los demás.
 */
export function TarjetaDeKudo({
  kudo,
  enDetalle = false,
}: {
  kudo: KudoDelMuro;
  enDetalle?: boolean;
}) {
  const fecha = new Date(kudo.publicadoEn);
  const [retirado, setRetirado] = useState(false);

  // Vetado desde aquí: se retira de la pantalla sin recargar el muro. Lo que decide si es visible
  // para los demás es el servidor, que ya no lo devuelve.
  if (retirado) {
    return (
      <article className="tarjeta tarjeta-kudo">
        <p role="status">Este reconocimiento fue vetado y ya no se muestra.</p>
      </article>
    );
  }

  return (
    <article className="tarjeta tarjeta-kudo">
      <div className="tarjeta-kudo__encabezado">
        {/* Decorativo: el nombre completo ya está en el título. */}
        <span className="avatar" aria-hidden="true">
          {iniciales(kudo.destinatarioNombre)}
        </span>

        <div>
          <h2>
            {enDetalle ? (
              <>
                {kudo.autorNombre} reconoció a {kudo.destinatarioNombre}
              </>
            ) : (
              <Link to={`/kudos/${kudo.id}`} className="enlace-titulo">
                {kudo.autorNombre} reconoció a {kudo.destinatarioNombre}
              </Link>
            )}
          </h2>
          <p className="categoria">{kudo.categoriaNombre}</p>
        </div>
      </div>

      <p className="tarjeta-kudo__contenido">{kudo.contenido}</p>

      {/* La fecha legible para la persona, y la exacta en el atributo para quien la necesite. */}
      <p className="meta">
        <time dateTime={kudo.publicadoEn}>{fechaLegible(fecha)}</time>
      </p>

      <Calificador
        contenidoId={kudo.id}
        promedio={kudo.promedioCalificacion}
        total={kudo.totalCalificaciones}
      />

      {kudo.totalAdjuntos > 0 && <AdjuntosDeKudo kudoId={kudo.id} total={kudo.totalAdjuntos} />}

      <HiloDeKudo kudoId={kudo.id} total={kudo.totalReplicas} abiertoInicial={enDetalle} />

      <AccionesDeModeracion tipo="Kudo" contenidoId={kudo.id} alVetar={() => setRetirado(true)} />
    </article>
  );
}

/** Las iniciales para el avatar: la primera letra del primer y del último nombre. */
function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  const primera = partes[0]?.[0] ?? '?';
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : '';

  return (primera + ultima).toUpperCase();
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
