/// <reference types="vite/client" />

/**
 * Las variables de entorno del cliente, declaradas.
 *
 * Sin esto llegan como `any` y el analizador las rechaza, con razón: un valor sin tipo que viene
 * de fuera y se usa para construir una URL de autenticación es justo donde no conviene perder la
 * comprobación.
 *
 * **Ninguna de estas es un secreto, y eso no es casualidad.** Todo lo que el empaquetador mete en
 * el cliente acaba en un archivo que cualquiera puede leer: el emisor, el identificador de cliente
 * y la audiencia son públicos por diseño. Un secreto aquí sería un secreto publicado, y por eso
 * PKCE existe: permite autenticar sin que el cliente guarde ninguno.
 */
interface ImportMetaEnv {
  /** URL del proveedor de identidad. Vacía significa que no hay identidad en este entorno. */
  readonly VITE_IDENTIDAD_EMISOR?: string;

  /** Identificador público de esta aplicación en el proveedor. */
  readonly VITE_IDENTIDAD_CLIENTE?: string;

  /** La API para la que se pide el token. */
  readonly VITE_IDENTIDAD_AUDIENCIA?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
