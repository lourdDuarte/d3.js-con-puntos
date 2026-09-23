# Línea de tiempo — Aplicación propia en D3.js

Aplicación web independiente para visualizar hitos de gestión (discursos de
apertura de sesiones legislativas) como una línea de tiempo interactiva,
agrupada por categoría, con filtros, búsqueda, zoom/pan y panel de detalle.

**No usa TimelineJS ni depende de Knight Lab.** Es HTML + CSS + JavaScript
propio, construido sobre dos librerías de terceros muy livianas y estables:

- **D3.js v7** — dibuja y anima el timeline (ejes, zoom, posicionamiento).
- **PapaParse v5** — parsea el CSV que se descarga del Google Sheet.

Los datos **nunca se copian dentro del proyecto**: la aplicación lee el
Google Sheet en vivo cada vez que se abre la página. Si editás el Sheet,
alcanza con recargar la página para ver los cambios — no hay que exportar
ni reconstruir nada.

---

## Índice

1. [Estructura del proyecto](#1-estructura-del-proyecto)
2. [Cómo ejecutarlo localmente](#2-cómo-ejecutarlo-localmente)
3. [Cómo publicarlo en GitHub Pages](#3-cómo-publicarlo-en-github-pages)
4. [Cómo cambiar el Google Sheet de origen](#4-cómo-cambiar-el-google-sheet-de-origen)
5. [Cómo actualizar la información](#5-cómo-actualizar-la-información)
6. [Cómo modificar los colores](#6-cómo-modificar-los-colores)
7. [Cómo modificar los estilos / el diseño](#7-cómo-modificar-los-estilos--el-diseño)
8. [Cómo agregar nuevas columnas](#8-cómo-agregar-nuevas-columnas)
9. [Cómo asignar una imagen a un hito puntual](#9-cómo-asignar-una-imagen-a-un-hito-puntual)
10. [Cómo funciona por dentro (resumen técnico)](#10-cómo-funciona-por-dentro-resumen-técnico)
11. [Rendimiento](#11-rendimiento)
12. [Solución de problemas](#12-solución-de-problemas)

---

## 1. Estructura del proyecto

```
timeline-d3/
├── index.html          # Estructura de la página (topbar, sidebar, timeline, panel de detalle)
├── style.css            # Todos los estilos visuales (colores, tipografía, layout, responsive)
├── app.js               # Toda la lógica de la aplicación (carga de datos, filtros, render D3, etc.)
├── config.js             # ÚNICO archivo que normalmente necesitás tocar: Sheet, columnas, colores, tamaños
├── assets/
│   └── favicon.svg      # Ícono de la pestaña del navegador
└── README.md             # Este archivo
```

No hay proceso de build, ni `npm install`, ni compilación de ningún tipo.
Es un sitio 100% estático: abrís `index.html` y funciona.

---

## 2. Cómo ejecutarlo localmente

Los navegadores modernos bloquean, por seguridad, que una página HTML
abierta directamente desde el disco (`file:///...`) haga pedidos de red
(`fetch`) a otro dominio como Google Sheets. Por eso hace falta servir la
carpeta con un servidor local muy simple (no hace falta instalar nada
más que lo que ya viene con Python o Node).

**Opción A — Python (ya viene instalado en Mac/Linux, y en Windows si
instalaste Python):**

```bash
cd timeline-d3
python3 -m http.server 8000
```

Después abrí en el navegador: `http://localhost:8000`

**Opción B — Node.js:**

```bash
cd timeline-d3
npx serve .
```

Y abrí la URL que te indique la terminal (por defecto algo como
`http://localhost:3000`).

**Opción C — Extensión "Live Server" de VS Code:** si trabajás con
Visual Studio Code, instalá la extensión "Live Server", click derecho
sobre `index.html` → "Open with Live Server".

Cualquiera de las tres opciones sirve. No hay diferencia funcional entre
ellas.

---

## 3. Cómo publicarlo en GitHub Pages

1. Creá un repositorio nuevo en GitHub (puede ser público o privado; si
   es privado necesitás un plan de GitHub que habilite Pages en repos
   privados).
2. Subí el contenido completo de esta carpeta (`index.html`, `style.css`,
   `app.js`, `config.js`, `assets/`, `README.md`) a la raíz del
   repositorio.
3. En el repositorio, andá a **Settings → Pages**.
4. En "Build and deployment" → "Source", elegí **"Deploy from a
   branch"**.
5. En "Branch", elegí `main` (o la rama donde subiste los archivos) y la
   carpeta `/ (root)`. Guardá.
6. Esperá uno o dos minutos. GitHub te va a mostrar la URL pública, con
   este formato:

   ```
   https://<tu-usuario>.github.io/<nombre-del-repositorio>/
   ```

7. Entrá a esa URL: la aplicación va a cargar los datos del Google Sheet
   configurado en `config.js`, en vivo, igual que en local.

**Importante:** como todo corre en el navegador del visitante (no hay
servidor propio), el Google Sheet tiene que estar accesible públicamente
para que la app funcione para cualquier persona que entre a la URL (ver
sección siguiente).

Cada vez que quieras publicar un cambio (por ejemplo, un color nuevo),
alcanza con subir (`git push`) el archivo modificado; GitHub Pages se
actualiza solo, en general en menos de un minuto.

---

## 4. Cómo cambiar el Google Sheet de origen

Toda la configuración de la fuente de datos vive en `config.js`, al
principio del archivo, en el bloque `SHEET_ID` / `GID`.

### 4.1. Requisito: el Sheet tiene que ser visible sin iniciar sesión

Para que la aplicación (y cualquier visitante) pueda leer el Sheet sin
pedir usuario y contraseña, el Sheet tiene que estar compartido como
**"Cualquiera con el enlace puede ver"**:

1. Abrí el Google Sheet.
2. Botón **"Compartir"** (arriba a la derecha).
3. En "Acceso general", elegí **"Cualquiera que tenga el enlace"**, con
   rol **"Lector"**.

Esto no lo hace editable por terceros — solo legible. La app nunca
escribe en el Sheet, únicamente lee.

### 4.2. Método recomendado: URL de GVIZ (no requiere "Publicar en la
web")

Este es el método que usa el proyecto por defecto. Solo necesitás dos
datos, que se sacan de la URL del propio Sheet:

```
https://docs.google.com/spreadsheets/d/  1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890AbCdEfGh  /edit#gid=  987654321
                                          └───────────────── SHEET_ID ─────────────────┘              └── GID ──┘
```

- **`SHEET_ID`**: la parte larga de la URL entre `/d/` y `/edit`.
- **`GID`**: el número que aparece después de `gid=` en la URL (identifica
  la pestaña/hoja concreta dentro del Sheet). Si no aparece `gid=` en la
  URL, es porque estás en la primera pestaña, y su GID es `0`.

Abrí `config.js` y actualizá:

```js
SHEET_ID: "TU_SHEET_ID_ACA",
GID: "TU_GID_ACA",
```

Guardá el archivo y recargá la página: no hace falta tocar nada más.

### 4.3. Método alternativo: "Publicar en la web" (si el método GVIZ te
da error de CORS)

En navegadores o configuraciones de red poco comunes, el método GVIZ
puede fallar. Como alternativa:

1. En el Google Sheet: **Archivo → Compartir → Publicar en la web**.
2. En "Vincular", elegí la hoja/pestaña específica (no "Todo el
   documento" si tenés más de una pestaña).
3. En el segundo selector, elegí **"Valores separados por comas
   (.csv)"**.
4. Click en **"Publicar"** y confirmá.
5. Copiá el enlace que te da (termina en `output=csv`).
6. Pegalo en `config.js`:

   ```js
   PUBLISHED_CSV_URL: "https://docs.google.com/spreadsheets/d/e/.../pub?output=csv",
   PREFERRED_SOURCE: "published",
   ```

La aplicación intenta primero la fuente indicada en `PREFERRED_SOURCE`
y, si falla, prueba automáticamente con la otra — así que podés dejar
ambas cargadas sin problema.

### 4.4. Actualización automática (opcional)

Por defecto, la app vuelve a leer el Sheet solamente cuando se recarga
la página (F5). Si preferís que se refresque sola cada cierto tiempo sin
que nadie tenga que recargar (útil si vas a dejar la página abierta en
una pantalla, por ejemplo), configurá en `config.js`:

```js
AUTO_REFRESH_MS: 300000,   // 300000 ms = 5 minutos
```

Poné `0` para desactivar el auto-refresh (comportamiento por defecto).

---

## 5. Cómo actualizar la información

No hace falta hacer nada en el proyecto: **la información se administra
enteramente desde el Google Sheet**. Agregá, editá o borrá filas
normalmente en el Sheet y los cambios van a aparecer en la aplicación la
próxima vez que se recargue la página (o automáticamente, si activaste
`AUTO_REFRESH_MS`).

Recomendaciones para que los datos se vean bien:

- **`Año`**: numérico (ej. `2016`), sin texto adicional.
- **Categoría / Subcategoría / Estado**: usá siempre la misma redacción
  exacta para el mismo concepto (p. ej. no alternar "Salud" y "salud " —
  con espacio de más — porque la app los tratará como valores distintos
  en los filtros). Si ya normalizaste estas columnas con el script de
  Apps Script de este mismo proyecto, no hace falta hacer nada más.
- **Fuente**: el nombre del documento de origen, tal como querés que se
  muestre en las tarjetas.
- Filas completamente vacías se ignoran automáticamente.

---

## 6. Cómo modificar los colores

Todos los colores están centralizados en `config.js` (colores por
Estado) y en `style.css` (paleta general de la interfaz).

### 6.1. Colores por Estado (los puntos del timeline y las etiquetas)

En `config.js`, bloque `COLORS_BY_ESTADO`:

```js
COLORS_BY_ESTADO: {
  "Anuncio":       { fill: "#5C8DF6", label: "Anuncio" },
  "En ejecución":  { fill: "#F0A94E", label: "En ejecución" },
  "Realizado":     { fill: "#3FAE7A", label: "Realizado" },
  "Finalizado":    { fill: "#8B7BD8", label: "Finalizado" },
  "default":       { fill: "#98A2B3", label: "Sin estado" }
},
```

- La **clave** (`"Anuncio"`, `"En ejecución"`, etc.) tiene que coincidir
  **exactamente** (mayúsculas, tildes y espacios incluidos) con el valor
  que aparece en la columna de Estado del Sheet.
- Si en el Sheet aparece un valor de Estado que no está en esta lista,
  la app usa automáticamente el color `"default"` — no rompe nada, pero
  te conviene agregar la clave correspondiente para que tenga su propio
  color.
- Para agregar un Estado nuevo, sumá una línea nueva con el mismo
  formato. Por ejemplo:

  ```js
  "Suspendido": { fill: "#E4574C", label: "Suspendido" },
  ```

- `fill` acepta cualquier color CSS válido (`#RRGGBB`, `rgb(...)`,
  nombres de color como `"tomato"`, etc.).

Después de guardar, la leyenda de colores (arriba del timeline), los
puntos del timeline y el color del panel de detalle se actualizan solos
— no hay que tocar nada más.

### 6.2. Paleta general de la interfaz (fondo, texto, bordes, acento)

En `style.css`, al principio del archivo, en el bloque `:root`:

```css
:root {
  --color-bg: ...;
  --color-surface: ...;
  --color-text: ...;
  --color-text-muted: ...;
  --color-border: ...;
  --color-accent: ...;
  ...
}
```

Son variables CSS: cambiá el valor de cualquiera de ellas y el cambio
se aplica en toda la aplicación (botones, bordes, fondos, etc.), porque
el resto del CSS las usa por referencia (`var(--color-accent)`, etc.) en
lugar de tener colores sueltos repetidos por todos lados.

---

## 7. Cómo modificar los estilos / el diseño

Todo el diseño visual vive en `style.css`, organizado por secciones con
comentarios (`/* ===== TOPBAR ===== */`, `/* ===== SIDEBAR ===== */`,
`/* ===== TIMELINE ===== */`, `/* ===== TOOLTIP ===== */`,
`/* ===== DETAIL PANEL ===== */`, `/* ===== RESPONSIVE ===== */`, etc.).

Algunos ajustes frecuentes:

- **Tipografía**: cambiá `font-family` en el bloque `body` (al
  principio del archivo) por la fuente que prefieras. Si querés usar una
  fuente de Google Fonts, agregá el `<link>` correspondiente en el
  `<head>` de `index.html`.
- **Tamaño del texto de las tarjetas / panel de detalle**: buscá las
  reglas `.detail-panel__content` y ajustá `font-size`.
- **Ancho de la barra lateral de filtros**: variable `--sidebar-width`
  en `:root`.
- **Tamaño y separación de las filas del timeline (una por categoría)**:
  esto se controla desde `config.js`, no desde el CSS — ver
  `CONFIG.LAYOUT.rowHeight` y `CONFIG.LAYOUT.rowGap`.
- **Radio de los puntos del timeline**: `CONFIG.LAYOUT.markerRadius` y
  `markerRadiusHover` en `config.js`.
- **Zoom mínimo / máximo y zoom inicial**: `CONFIG.LAYOUT.minZoom`,
  `maxZoom`, `initialZoom` en `config.js`.

Los puntos de quiebre (breakpoints) responsive están al final de
`style.css`, en bloques `@media (max-width: ...)`. Hay tres: uno para
tablets (1024px), uno para pantallas chicas/tablets verticales (768px) y
uno para celulares (640px, con ajustes adicionales para pantallas muy
angostas dentro de `app.js`, función `getEffectiveMargin`, que reduce el
espacio reservado para las etiquetas de categoría en pantallas angostas
para que el timeline tenga más lugar).

---

## 8. Cómo agregar nuevas columnas

El proyecto ya lee y usa, como mínimo: Año, Categoría, Subcategoría,
Título (Headline), Texto, Fuente y Estado. Si el Google Sheet tiene
columnas adicionales que no se usan (por ejemplo "Recategorización" o
"Aporte" en el Sheet original), no hace falta hacer nada — se ignoran
automáticamente y no generan errores.

Para que la aplicación **use y muestre** una columna nueva del Sheet
(por ejemplo, agregar un campo "Responsable" a las tarjetas), seguí
estos pasos:

### 8.1. Mapear la columna en `config.js`

En el bloque `COLUMNS`, agregá una entrada nueva. La clave (izquierda)
es el nombre interno que va a usar el código; el valor (derecha) tiene
que ser **exactamente** el texto del encabezado de esa columna en el
Google Sheet:

```js
COLUMNS: {
  anio: "Año",
  categoria: "Categoria",
  subcategoria: "Subcategoría",
  headline: "Título",
  text: "Extracción del discurso",
  fuente: "Fuente",
  estado: "Observacion",
  responsable: "Responsable"   // ← nueva columna
},
```

### 8.2. Leer el campo nuevo al cargar los datos

En `app.js`, sección **"1. CARGA DE DATOS DESDE GOOGLE SHEETS"**, buscá
la función que arma cada evento a partir de la fila del Sheet (el bloque
`events.push({ ... })`). Agregá una línea con el campo nuevo, usando el
mismo mapeo que definiste en `config.js`:

```js
events.push({
  id: "evt-" + i,
  anio: anio,
  categoria: categoria,
  // ...campos existentes...
  responsable: (row[c.responsable] || "").toString().trim(),   // ← nuevo
  ...
});
```

### 8.3. Mostrar el campo nuevo en el panel de detalle

Un poco más abajo en el mismo archivo, sección **"10. PANEL DE
DETALLE"**, función `openDetailPanel(e)`, vas a ver bloques de HTML tipo:

```js
<div class="detail-field">
  <div class="detail-field__label">Fuente</div>
  <div class="detail-field__value">${escapeHtml(e.fuente)}</div>
</div>
```

Agregá un bloque igual para el campo nuevo:

```js
<div class="detail-field">
  <div class="detail-field__label">Responsable</div>
  <div class="detail-field__value">${escapeHtml(e.responsable)}</div>
</div>
```

### 8.4. (Opcional) Incluirlo en la búsqueda

Si querés que el buscador también encuentre coincidencias en ese campo,
buscá en `app.js`, sección **"1. CARGA DE DATOS DESDE GOOGLE SHEETS"**,
el campo `searchBlob` (se arma una sola vez, al cargar los datos, uniendo
los textos donde se puede buscar) y agregá el campo nuevo a la lista:

```js
searchBlob: normalizeForSearch(
  [headline, row[c.text], categoria, row[c.subcategoria], row[c.fuente], row[c.responsable]]
    .filter(Boolean)
    .join(" | ")
),
```

### 8.5. (Opcional) Convertirlo en un filtro de la barra lateral

Los filtros de tipo checklist (Categoría, Subcategoría, Estado, Fuente)
comparten toda su lógica en una única función reutilizable
(`renderChecklistFilter`), así que agregar uno nuevo es más simple de lo
que parece. Siguiendo el ejemplo de "Responsable":

1. **Estado global** (`app.js`, sección "2. ESTADO GLOBAL DE LA APP"):
   agregá el campo a `state` (lista de valores) y a `state.filters`
   (selección activa):

   ```js
   responsables: [],          // junto a categorias/subcategorias/estados/fuentes
   ...
   filters: {
     ...
     responsable: new Set(),  // junto a los demás Set() de filters
   },
   ```

2. **Lista de valores únicos** (sección "3. CONSTRUCCIÓN DE LISTAS DE
   FILTROS", función `computeFacets`): agregá una línea igual a las
   existentes:

   ```js
   state.responsables = buildFacet(state.allEvents, "responsable");
   ```

3. **Aplicar el filtro** (sección "4. FILTRADO + BÚSQUEDA", función
   `getFilteredEvents`): agregá la misma condición que ya existe para
   `fuente`:

   ```js
   if (f.responsable.size && !f.responsable.has(e.responsable)) return false;
   ```

4. **Dibujar los checkboxes** (sección "11. SIDEBAR: FILTROS", función
   `renderAllFilters`): agregá una línea igual a las existentes:

   ```js
   renderChecklistFilter("filter-responsable", state.responsables, "responsable", false);
   ```

5. **Contenedor en el HTML** (`index.html`): copiá el bloque
   `<div class="filter-group" data-filter="fuente">...</div>` completo,
   pegalo debajo, y reemplazá `fuente`/`Fuente` por `responsable`/
   `Responsable` (incluido el `id="filter-responsable"` del `<div>`
   interno, que tiene que coincidir con el `containerId` usado en el
   paso 4).

Con esos cinco cambios, el filtro nuevo aparece en el sidebar, cuenta
ocurrencias, y se combina automáticamente con el resto de los filtros y
la búsqueda — sin tocar ninguna otra parte del código.

---

## 9. Cómo asignar una imagen a un hito puntual

El Google Sheet de origen no tiene una columna de imagen, así que las
imágenes se asignan a mano, hito por hito, en `config.js`, bloque
`IMAGE_OVERRIDES`:

```js
IMAGE_OVERRIDES: [
  {
    anio: 1996,
    titulo: "Convenio desmotadores-Banco Formosa créditos 50% tasa",
    src: "assets/images/1996-modelo-formoseno-1.png",
    alt: "Tapa del libro Modelo Formoseño"
  },
  // ...una entrada más por cada hito con imagen...
],
```

Para agregar una imagen a otro hito:

1. Poné el archivo de imagen dentro de `assets/images/` (creá la
   carpeta si no existe).
2. Sumá una entrada al array `IMAGE_OVERRIDES` con:
   - `anio`: el año exacto del hito (numérico, sin comillas).
   - `titulo`: el texto **exacto** de la columna "Título" de ese hito
     en el Google Sheet (mismo mayúsculas/minúsculas, tildes y
     espacios — copialo y pegalo directo del Sheet para evitar
     errores de tipeo).
   - `src`: la ruta al archivo dentro de `assets/images/`.
   - `alt`: un texto descriptivo corto (se usa como texto alternativo
     de accesibilidad).

La imagen aparece automáticamente arriba de los datos en el panel de
detalle de ese hito. Además, el punto correspondiente en el timeline se
dibuja con un borde de color de acento (en vez del borde blanco
habitual) para que se note a simple vista que tiene una imagen
asociada, y el tooltip al pasar el mouse agrega la leyenda "🖼 Tiene
imagen — click para verla".

Si en algún momento el Sheet suma su propia columna de imagen (por
ejemplo, un link a Google Drive o a cualquier otro hosting), lo más
prolijo es reemplazar este mecanismo por esa columna, siguiendo el
mismo procedimiento que la sección 8 ("Cómo agregar nuevas columnas")
en vez de mantener la lista manual.

---

## 10. Cómo funciona por dentro (resumen técnico)

`app.js` está organizado en secciones numeradas (0 a 14), cada una con
un comentario de bloque que la identifica:

0. **Utilidades**: normalización de texto (sin tildes, minúsculas) para
   comparar/buscar, debounce, formateo, escape de HTML.
1. **Carga de datos**: arma la URL según `config.js`, descarga el CSV
   (con `fetch`), lo parsea con PapaParse, normaliza cada fila a un
   objeto de evento (`{ anio, categoria, subcategoria, headline, text,
   fuente, estado, searchBlob }`) usando el mapeo de `CONFIG.COLUMNS`, y
   descarta filas sin los campos mínimos (año numérico y título).
2. **Estado global**: un único objeto `state` con los datos crudos, los
   filtros activos, el texto de búsqueda, y referencias a los elementos
   D3 ya creados (para no recrearlos en cada render).
3. **Construcción de listas de filtros**: calcula la lista de valores
   únicos de Categoría/Subcategoría/Estado/Fuente/Año presentes en los
   datos, para poblar los filtros del sidebar.
4. **Filtrado + búsqueda**: combina todos los filtros activos
   (checkboxes + rango de años) más el texto de búsqueda (contra el
   campo `searchBlob` precalculado, sin tildes ni mayúsculas) para
   producir la lista de eventos visibles en cada momento.
5. **Layout del timeline**: para los eventos visibles en cada fila
   (categoría) y en el nivel de zoom actual, agrupa por proximidad en
   píxeles (no por fecha exacta) y acomoda los puntos muy cercanos en una
   pequeña grilla (varias columnas si hace falta) para minimizar la
   superposición. Cada hito se dibuja siempre como un punto individual:
   nunca se reemplazan varios hitos por un único marcador con contador.
   Este cálculo se rehace en cada tick de zoom/pan y en cada cambio de
   filtro.
6. **Estructura base del SVG**: crea los grupos (`<g>`) de D3 para
   fondos de fila, etiquetas, eje y marcadores; calcula el margen
   izquierdo según el ancho de pantalla (más angosto en celulares, para
   dejar más lugar al timeline) y trunca con "…" las etiquetas de
   categoría que no entran en ese margen (mostrando el nombre completo
   al tocar/pasar el mouse, vía un `<title>` dentro de cada etiqueta).
7. **Render de marcadores**: dibuja/actualiza los puntos (un círculo SVG
   por hito, siempre) según el resultado del cálculo de layout.
8. **Zoom / pan**: comportamiento `d3.zoom`, con límites definidos en
   `CONFIG.LAYOUT.minZoom` / `maxZoom`, que recalcula el layout y vuelve
   a dibujar en cada evento de zoom/pan.
9. **Tooltip**: resumen breve al pasar el mouse por un punto.
10. **Panel de detalle**: contenido completo (HTML armado directamente
    en `openDetailPanel`) al hacer click en un punto.
11. **Sidebar: filtros**: dibuja los checkboxes/rango y conecta sus
    eventos con la función de filtrado.
12. **Leyenda de estado**.
13. **Resultados / estado de carga**: contador de hitos visibles y los
    mensajes de "cargando" / "error" / "sin resultados".
14. **Inicialización general**: orquesta el orden de arranque (cargar
    datos → construir listas de filtros → configurar SVG → primer
    render → conectar eventos de interacción → configurar auto-refresh
    si está activado).

No hay ningún framework (React, Vue, etc.) ni paso de build: todo es
JavaScript "vanilla" + D3, pensado para que cualquier persona con
conocimientos básicos de JS pueda leer y modificar el código sin
herramientas adicionales.

---

## 11. Rendimiento

La aplicación está pensada para manejar sin problema miles de eventos:

- El layout (distribución en grilla anti-superposición) solo se
  recalcula para los eventos que pasan el filtro/búsqueda actual, no
  para el dataset completo.
- Los renders de D3 usan el patrón estándar *data join*
  (`enter/update/exit`), así que solo se crean/destruyen los elementos
  SVG que realmente cambiaron entre un render y el siguiente, no se
  redibuja todo desde cero.
- La búsqueda por texto tiene un *debounce* (`CONFIG.SEARCH_DEBOUNCE_MS`,
  180 ms por defecto) para no recalcular en cada tecla presionada.
- El resize de ventana también tiene *debounce*
  (`CONFIG.RESIZE_DEBOUNCE_MS`).
- Los eventos de zoom/pan están optimizados para no bloquear el hilo
  principal del navegador incluso con miles de puntos en pantalla.

Si en algún momento el dataset crece mucho (decenas de miles de filas)
y notás que la carga inicial del CSV es lenta, el cuello de botella va a
estar en la descarga/parseo del Sheet, no en el renderizado — en ese
caso, lo más efectivo sería paginar o filtrar los datos del lado del
Sheet antes de traerlos.

---

## 12. Solución de problemas

**"No se pudo leer el Google Sheet. Revisá config.js y el README."**
Este mensaje aparece cuando ninguna de las dos fuentes configuradas
(`GVIZ_CSV_URL` / `PUBLISHED_CSV_URL`) pudo leerse. Motivos más
comunes:

- El Sheet no está compartido como "Cualquiera con el enlace puede
  ver" (ver sección 4.1).
- `SHEET_ID` o `GID` están mal copiados en `config.js`.
- Estás abriendo `index.html` directamente desde el disco
  (`file:///...`) en lugar de con un servidor local (ver sección 2) —
  el navegador bloquea el pedido de red en ese caso.
- No hay conexión a internet.

Abrí la consola del navegador (F12 → pestaña "Console") para ver el
error específico devuelto por `fetch`.

**Los filtros o el buscador no encuentran valores que sé que están en
el Sheet.**
Revisá que el nombre de columna en `config.js` (`COLUMNS`) coincida
exactamente con el encabezado real del Sheet, incluyendo mayúsculas y
tildes. Un espacio de más al final del encabezado en el Sheet también
puede causar esto.

**Cambié algo en el Sheet y no se actualiza en la página.**
Recordá que, salvo que hayas activado `AUTO_REFRESH_MS`, los datos se
leen una sola vez al cargar la página — hace falta recargar (F5) para
ver cambios nuevos.

**Se ve distinto en el celular que en la computadora.**
Es esperado: el diseño es responsive y se adapta al ancho de pantalla
(sidebar de filtros se convierte en panel superpuesto, las etiquetas de
categoría se acortan si son muy largas, etc.). Si algo se ve realmente
roto (elementos superpuestos, texto cortado sin el "…", etc.), es un
error y conviene revisarlo — no es el comportamiento esperado.
