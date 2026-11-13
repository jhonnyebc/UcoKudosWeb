# UCO Kudos — cliente web

Cliente web de la plataforma de reconocimientos de la Universidad Católica de Oriente. Es un repositorio aparte del back-end por RT-02, y una PWA mobile first por ADR-0015.

El back-end y toda la documentación de arquitectura están en [UcoKudos](https://github.com/jhonnyebc/UcoKudos). Las decisiones que gobiernan este repositorio viven allí, en `docs/adr/`.

## Por qué está hecho así

**Mobile first, no «adaptable».** El enunciado estima que el 90 % de los usuarios entrará desde un celular (DRV-001), y eso cambia el orden en que se escribe todo: los estilos empiezan por la pantalla pequeña y la amplían al final, la navegación principal va **abajo** porque es donde llega el pulgar, y el peso de la primera carga es un presupuesto que se mide, no una intención.

**Los tres compromisos de QA-MOV-01**, y cómo se comprueba cada uno:

| Compromiso                                                  | Cómo se verifica                         | Estado             |
| ----------------------------------------------------------- | ---------------------------------------- | ------------------ |
| Carga inicial por debajo de 300 KB comprimidos              | `npm run peso`, que falla si se supera   | **65 KB**          |
| Primera pantalla útil en menos de 2,5 s en red móvil        | Pruebas de punta a punta en navegador    | **No medido**: no hay pruebas en navegador |
| Objetivos táctiles de 44 px y sin desplazamiento horizontal | Estilos base y revisión en pantalla real | Base puesta        |

**El token de sesión vive en memoria y en ningún otro sitio.** Un token en `localStorage` queda al alcance de cualquier script inyectado; el precio de tenerlo en memoria es perder la sesión al recargar, y se paga a gusto. Hay una regla del analizador que impide usar el almacenamiento del navegador, para que no se cuele en un descuido.

**Ninguna decisión de autorización se toma aquí.** La interfaz esconde lo que el usuario no puede hacer por comodidad, pero la regla la aplica la API. Un menú escondido no es un control de acceso.

## Arrancar

Necesita el back-end corriendo en `localhost:8082` (ver su manual de puesta a punto).

```bash
npm install
```

```bash
npm run dev
```

Queda en `http://localhost:5174`. Las llamadas a `/api` se redirigen al back-end, así que no hace falta configurar CORS: en producción los dos están detrás del mismo proxy inverso, de modo que el mismo origen es la situación real y no un truco de desarrollo.

## Guiones

| Guion               | Para qué                                                  |
| ------------------- | --------------------------------------------------------- |
| `npm run dev`       | Servidor de desarrollo                                    |
| `npm run build`     | Comprueba tipos y construye                               |
| `npm test`          | Pruebas de componentes, con verificación de accesibilidad |
| `npm run lint`      | Analizador estático                                       |
| `npm run formato`   | Comprueba el formato                                      |
| `npm run peso`      | Presupuesto de peso de QA-MOV-01, tras construir          |
| `npm run tipos:api` | Regenera los tipos desde el contrato OpenAPI              |

## Lo que falta, dicho claro

- **El listado de avisos no existe todavía en la API.** La pantalla está escrita y la sesión funciona, pero el back-end solo expone los avisos en tiempo real y la clave pública de Web Push: falta un `GET /api/avisos` que devuelva los avisos persistidos de quien pregunta. Hasta entonces esa pantalla muestra un error honesto en lugar de datos inventados.
- **Los tipos del contrato.** ADR-0015 exige generarlos del OpenAPI y hoy están escritos a mano en `src/api/tipos.ts`, con el guion ya preparado. Mientras sean a mano, una ruptura de contrato no sale al compilar, que es justo lo que la decisión quería evitar.
- **El buscador de personas** al publicar: hoy se pega el identificador porque la API todavía no ofrece búsqueda. Pedirle un identificador a un usuario no es aceptable como versión final.
- **La renovación silenciosa de la sesión.** El token vive en memoria, así que al recargar la página hay que volver a entrar. Es el precio consciente de no guardarlo en el navegador (ADR-0015), pero conviene suavizarlo renovando en silencio contra el proveedor.
- **La verificación de contraste.** La comprobación automática de accesibilidad corre en cada prueba, pero la regla de contraste está desactivada porque el DOM simulado no pinta y la regla se omitiría en silencio. Se mide en navegador real, en las pruebas de punta a punta.
- **Los iconos de la PWA** (`icono-192.png` y `icono-512.png`) todavía no existen.
