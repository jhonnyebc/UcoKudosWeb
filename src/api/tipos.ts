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
