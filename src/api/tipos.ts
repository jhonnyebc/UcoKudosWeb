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

/** Un programa académico, para elegir al registrarse. */
export interface Programa {
  readonly id: string;
  readonly nombre: string;
  readonly codigo: string;
}

export interface Facultad {
  readonly id: string;
  readonly nombre: string;
  readonly codigo: string;
  readonly programas: readonly Programa[];
}

/** Un rol del catálogo. El ámbito dice qué hay que elegir además: nada, la facultad o el programa. */
export interface RolDelCatalogo {
  readonly id: number;
  readonly nombre: string;
  readonly ambito: 'Universidad' | 'Facultad' | 'Programa';
}

/** Una persona con su solicitud: lo que ve su aprobador y lo que devuelve el perfil. */
export interface PersonaConSolicitud {
  readonly id: string;
  readonly correoInstitucional: string;
  readonly nombreCompleto: string;
  readonly rol: string;
  readonly estadoCuenta: string;
  readonly correoVerificado: boolean;
  readonly celularVerificado: boolean;
}

/** En qué punto está un registro: qué falta para que la cuenta quede activa. */
export interface EstadoRegistro {
  readonly correoVerificado: boolean;
  readonly celularVerificado: boolean;
  readonly solicitudAprobada: boolean;
  readonly estadoCuenta: string;
}

/** Un reporte que espera decisión, con el contenido reportado a la vista. */
export interface ReportePendiente {
  readonly id: string;
  readonly tipoContenido: 'Kudo' | 'Replica';
  readonly contenidoId: string;
  readonly motivo: string;
  readonly reportadoPor: string;
  readonly autorDelContenido: string;
  readonly contenido: string;
  readonly presentadoEn: string;
}

/** Una respuesta del hilo de un Kudo. La profundidad es para la sangría: el hilo llega ya ordenado. */
export interface Replica {
  readonly id: string;
  readonly kudoId: string;
  readonly replicaPadreId: string | null;
  readonly autorId: string;
  readonly autorNombre: string;
  readonly contenido: string;
  readonly profundidad: number;
  readonly totalReplicas: number;
  readonly promedioCalificacion: number | null;
  readonly totalCalificaciones: number;
  readonly publicadaEn: string;
}

/** Un programa de una persona y por qué: «Principal» (el de su rol), «Matrícula» o «Docencia». */
export interface ProgramaDePersona {
  readonly programaId: string;
  readonly programaNombre: string;
  readonly programaCodigo: string;
  readonly facultadId: string;
  readonly facultadNombre: string;
  readonly relacion: 'Principal' | 'Matrícula' | 'Docencia';
}

/** Lo que el enunciado pide poder conocer de cada persona: sus programas, o la facultad que acompaña. */
export interface ProgramasDePersona {
  readonly personaId: string;
  readonly nombreCompleto: string;
  readonly rol: string;
  readonly facultadAcompanada: string | null;
  readonly programas: readonly ProgramaDePersona[];
}

export interface ProgramaAdmin {
  readonly id: string;
  readonly nombre: string;
  readonly codigo: string;
  readonly activo: boolean;
}

export interface FacultadAdmin {
  readonly id: string;
  readonly nombre: string;
  readonly codigo: string;
  readonly activa: boolean;
  readonly programas: readonly ProgramaAdmin[];
}

/** Un conteo con su etiqueta: una categoría, un mes, una persona. */
export interface Conteo {
  readonly etiqueta: string;
  readonly total: number;
}

/** Indicadores de gestión del ámbito de quien consulta. */
export interface Indicadores {
  readonly alcance: string;
  readonly kudosPublicados: number;
  readonly personasActivas: number;
  readonly calificacionPromedio: number | null;
  readonly totalCalificaciones: number;
  readonly reportesPendientes: number | null;
  readonly porCategoria: readonly Conteo[];
  readonly porMes: readonly Conteo[];
  readonly masReconocidos: readonly Conteo[];
  readonly masReconocen: readonly Conteo[];
}

/** Una persona que quien consulta administra. */
export interface UsuarioAdministrado {
  readonly id: string;
  readonly nombreCompleto: string;
  readonly correoInstitucional: string;
  readonly rol: string;
  readonly estadoCuenta: string;
}
