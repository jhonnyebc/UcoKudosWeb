/**
 * Tipos del contrato con la API.
 *
 * **Esto es provisional y debe desaparecer.** ADR-0015 exige que los tipos se generen del contrato
 * OpenAPI, no que se escriban a mano, precisamente para que una ruptura entre el cliente y la API
 * salga al compilar y no en producción. El guion `npm run tipos:api` hace la generación; estos
 * tipos a mano son el puente hasta que el contrato se publique como archivo.
 *
 * Mientras tanto, están escritos siguiendo los DTO del back-end, con los nombres en minúscula
 * inicial, que es como los serializa ASP.NET.
 */

export interface KudoDelMuro {
  readonly id: string;
  readonly autorId: string;
  readonly autorNombre: string;
  readonly destinatarioId: string;
  readonly destinatarioNombre: string;
  readonly categoriaId: string;
  readonly categoriaNombre: string;
  readonly contenido: string;
  readonly totalReplicas: number;
  readonly promedioCalificacion: number | null;
  readonly totalCalificaciones: number;
  readonly totalAdjuntos: number;
  readonly publicadoEn: string;
}

export interface PaginaMuro {
  readonly elementos: readonly KudoDelMuro[];
  readonly cursorSiguiente: string | null;
}

export interface Categoria {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion: string;
  readonly activa: boolean;
}

export interface PublicarKudoPeticion {
  readonly destinatarioId: string;
  readonly categoriaId: string;
  readonly contenido: string;
}

export interface KudoPublicado {
  readonly id: string;
  readonly publicadoEn: string;
}

export interface Aviso {
  readonly id: number;
  readonly clave: string;
  readonly titulo: string;
  readonly cuerpo: string;
  readonly leido: boolean;
  readonly generadoEn: string;
}

/**
 * Los avisos con el contador de no leídos.
 *
 * El contador viene del servidor y cuenta **todos** los no leídos, no solo los de esta página:
 * sacarlo contando lo que llegó daría un número equivocado en cuanto haya más de una página.
 */
export interface PaginaAvisos {
  readonly elementos: readonly Aviso[];
  readonly sinLeer: number;
}

/**
 * Una persona en el buscador de destinatarios.
 *
 * Solo identificador y nombre: la API no devuelve el correo ni el celular en esta consulta, para
 * que una caja de búsqueda no se convierta en un volcado del directorio de la universidad.
 */
export interface PersonaBuscada {
  readonly id: string;
  readonly nombreCompleto: string;
}

/** Resultado de verificar la cadena de hashes de la auditoría. */
export interface Verificacion {
  readonly eventosRevisados: number;
  readonly intacta: boolean;
  readonly primerEventoAlterado: number | null;
  readonly detalle: string;
}

/** Lo que devuelve la API al reservar un adjunto: con su identificador se sube y se confirma. */
export interface SubidaAdjunto {
  readonly adjuntoId: string;
}

export interface Adjunto {
  readonly id: string;
  readonly nombreOriginal: string;
  readonly tipoDetectado: string | null;
  readonly tamanoBytes: number;
}

export interface DetalleKudo {
  readonly kudo: KudoDelMuro;
  readonly adjuntos: readonly Adjunto[];
}
