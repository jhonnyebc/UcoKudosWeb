import { ErrorDeApi, pedir, pedirArchivo } from '../api/cliente';
import type { SubidaAdjunto } from '../api/tipos';

/**
 * Subida de adjuntos (RF-08, ADR-0012).
 *
 * La subida va en **tres pasos y todos pasan por la API, con la sesión**: se reserva el adjunto, se
 * sube su contenido, y se confirma para que el servidor lo inspeccione. El almacenamiento no es
 * alcanzable desde internet, así que no hay enlaces que filtrar ni caducar.
 */

/** Tipos que acepta el dominio. Tiene que coincidir con `Adjunto.TiposPermitidos` del back-end. */
export const TIPOS_PERMITIDOS: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

/** 5 MiB, el máximo del dominio (`Adjunto.TamanoMaximoBytes`). */
export const TAMANO_MAXIMO_BYTES = 5 * 1024 * 1024;

/** Máximo de adjuntos por Kudo (`Adjunto.MaximoPorKudo`). */
export const MAXIMO_POR_KUDO = 5;

/** El atributo `accept` del selector de archivos, para que el sistema filtre lo que enseña. */
export const ACEPTAR = TIPOS_PERMITIDOS.join(',');

/**
 * Comprueba la selección **antes de publicar**, para no hacer esperar a nadie por algo que se va a
 * rechazar. Es comodidad, no seguridad: el servidor vuelve a comprobar el contenido real del
 * archivo, que es lo único que no puede mentir. Quien salte este formulario se topa con él.
 *
 * Devuelve el motivo del primer problema, o `null` si todo está bien.
 */
export function validarSeleccion(archivos: readonly File[]): string | null {
  if (archivos.length > MAXIMO_POR_KUDO) {
    return `Un Kudo admite como máximo ${MAXIMO_POR_KUDO} adjuntos.`;
  }

  for (const archivo of archivos) {
    if (!TIPOS_PERMITIDOS.includes(archivo.type)) {
      return `«${archivo.name}» no se puede adjuntar: solo se admiten imágenes JPG, PNG o WebP y archivos PDF.`;
    }

    if (archivo.size === 0) {
      return `«${archivo.name}» está vacío.`;
    }

    if (archivo.size > TAMANO_MAXIMO_BYTES) {
      return `«${archivo.name}» pesa más de ${TAMANO_MAXIMO_BYTES / 1024 / 1024} MB.`;
    }
  }

  return null;
}

/** Un tamaño legible: «320 KB», «2,4 MB». */
export function tamanoLegible(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

/**
 * Sube un archivo a un Kudo ya publicado. Lanza con un mensaje que se le puede enseñar a la
 * persona si algo falla, y dice **en qué paso** falló.
 */
export async function subirAdjunto(kudoId: string, archivo: File): Promise<void> {
  // Paso 1: pedir permiso. La API comprueba que quien pide es el autor del Kudo, el tipo declarado
  // y el tamaño declarado, y devuelve una URL firmada.
  //
  // Se envuelve el error para que diga **qué archivo** falló: sin eso, con tres adjuntos, el mensaje
  // «otra operación modificó este contenido» no permite saber a cuál se refiere ni si los demás
  // llegaron. Lo delató el primer uso real desde un celular.
  let permiso: SubidaAdjunto;
  try {
    permiso = await pedir<SubidaAdjunto>(`/kudos/${kudoId}/adjuntos/intencion`, {
      metodo: 'POST',
      cuerpo: {
        nombreArchivo: archivo.name,
        tipoDeclarado: archivo.type,
        tamanoDeclarado: archivo.size,
      },
    });
  } catch (causa) {
    const motivo = causa instanceof ErrorDeApi ? causa.message : 'error desconocido';
    throw new Error(`«${archivo.name}» no se pudo adjuntar: ${motivo}`);
  }

  // Paso 2: subir el contenido a la API, con la sesión. La API lo guarda en el almacenamiento, que
  // no es alcanzable desde internet. Antes se subía directo con una URL prefirmada y fallaba con
  // 403 en producción: el almacenamiento validaba la firma con un secreto distinto del esperado.
  try {
    await pedir<void>(`/kudos/${kudoId}/adjuntos/${permiso.adjuntoId}/contenido`, {
      metodo: 'PUT',
      archivo,
    });
  } catch (causa) {
    const motivo = causa instanceof ErrorDeApi ? causa.message : 'error desconocido';
    throw new Error(`No se pudo subir «${archivo.name}»: ${motivo}`);
  }

  // Paso 3: confirmar. El servidor lee el archivo y comprueba su tipo REAL por los primeros bytes,
  // no por la extensión: un ejecutable renombrado a .pdf se rechaza aquí.
  try {
    await pedir<void>(`/kudos/${kudoId}/adjuntos/${permiso.adjuntoId}/confirmar`, {
      metodo: 'POST',
    });
  } catch (causa) {
    const motivo = causa instanceof ErrorDeApi ? causa.message : 'error desconocido';
    throw new Error(`«${archivo.name}» no se aceptó: ${motivo}`);
  }
}

/**
 * Descarga un adjunto con la sesión de quien lo pide. Cada descarga queda auditada en el servidor,
 * que es lo que permite saber quién vio qué archivo.
 */
export async function descargarAdjunto(kudoId: string, adjuntoId: string): Promise<Blob> {
  return await pedirArchivo(`/kudos/${kudoId}/adjuntos/${adjuntoId}/archivo`);
}
