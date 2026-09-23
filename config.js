/**
 * config.js
 * ---------------------------------------------------------------------------
 * Configuración centralizada de todo el proyecto. Cualquier ajuste de
 * fuente de datos, columnas, colores, tamaños o comportamiento se hace
 * ÚNICAMENTE en este archivo. El resto del código (app.js) lee siempre
 * de aquí y no tiene valores "hardcodeados".
 * ---------------------------------------------------------------------------
 */

const CONFIG = {

  // ---------------------------------------------------------------------
  // FUENTE DE DATOS (Google Sheets)
  // ---------------------------------------------------------------------
  // La aplicación lee el Sheet SIEMPRE en vivo (nunca se copian datos al
  // proyecto). Hay dos formas de obtener el CSV público de un Google
  // Sheet; probá primero con GVIZ_URL (no requiere "Publicar en la web",
  // solo que el Sheet esté compartido como "Cualquiera con el enlace,
  // puede ver"). Si en tu navegador da error de CORS al cargar, seguí
  // las instrucciones del README para generar un link de "Publicar en
  // la web" y pegalo en PUBLISHED_CSV_URL; en ese caso también poné
  // PREFERRED_SOURCE = "published".
  SHEET_ID: "1G8HB9Bf7P5CUlTqjkS4oaDg-2eU20D2nT_lhClXjsE0",
  GID: "0",

  // Se arma solo a partir de SHEET_ID y GID — no hace falta tocarlo.
  get GVIZ_CSV_URL() {
    return `https://docs.google.com/spreadsheets/d/${this.SHEET_ID}/gviz/tq?tqx=out:csv&gid=${this.GID}`;
  },

  // Completar con el link de "Archivo > Compartir > Publicar en la web"
  // (formato CSV) si preferís esa alternativa. Ver README, sección
  // "Cómo cambiar el Google Sheet".
  PUBLISHED_CSV_URL: "",

  // "gviz" | "published" — cuál usar primero. Si falla, se intenta con
  // el otro automáticamente (ver fetchSheetData en data.js).
  PREFERRED_SOURCE: "gviz",

  // Cada cuánto tiempo (ms) volver a pedir el Sheet automáticamente sin
  // que el usuario recargue la página. Poner 0 para desactivar.
  AUTO_REFRESH_MS: 0,

  // ---------------------------------------------------------------------
  // MAPEO DE COLUMNAS
  // ---------------------------------------------------------------------
  // Nombres EXACTOS de las columnas tal como aparecen en la fila de
  // encabezado del Google Sheet. Si renombrás una columna en el Sheet,
  // actualizá el valor correspondiente acá (ver README: "Cómo agregar
  // nuevas columnas").
  COLUMNS: {
    anio: "Año",
    categoria: "Categoria",
    subcategoria: "Subcategoría",
    headline: "Título",
    text: "Extracción del discurso",
    fuente: "Fuente",
    estado: "Observacion"
  },

  // Columnas adicionales del Sheet que existen pero no se usan para la
  // visualización (se ignoran al leer, no generan error si están
  // presentes ni si faltan).
  IGNORED_COLUMNS: ["Recategorización", "Aporte"],

  // ---------------------------------------------------------------------
  // IMÁGENES ASIGNADAS A HITOS PUNTUALES
  // ---------------------------------------------------------------------
  // El Google Sheet de origen no tiene una columna de imagen, así que las
  // imágenes se asignan acá, manualmente, hito por hito. Cada entrada se
  // identifica por Año + el texto EXACTO de la columna "Título" en el
  // Sheet (mismo mapeo que COLUMNS.headline) y apunta a un archivo dentro
  // de assets/images/. Si en el futuro el Sheet suma una columna propia
  // de imagen, esto se puede reemplazar por esa columna (ver README,
  // "Cómo agregar nuevas columnas"); mientras tanto, para sumar una
  // imagen a otro hito, agregá una entrada más a esta lista.
  IMAGE_OVERRIDES: [
    {
      anio: 1996,
      titulo: "Convenio desmotadores-Banco Formosa créditos 50% tasa",
      src: "assets/images/1996-modelo-formoseno-1.png",
      alt: "Tapa del libro Modelo Formoseño"
    },
    {
      anio: 1996,
      titulo: "Fondo Asistencia Producción Primaria creado",
      src: "assets/images/1996-modelo-formoseno-2.png",
      alt: "Contratapa del libro Modelo Formoseño"
    }
  ],

  // ---------------------------------------------------------------------
  // COLORES POR ESTADO
  // ---------------------------------------------------------------------
  // Se usa el valor tal cual aparece en la columna "estado" del Sheet
  // como clave. Si aparece un valor no listado acá, se usa "default".
  COLORS_BY_ESTADO: {
    "Anuncio":       { fill: "#5C8DF6", label: "Anuncio" },
    "En ejecución":  { fill: "#F0A94E", label: "En ejecución" },
    "Realizado":     { fill: "#3FAE7A", label: "Realizado" },
    "Finalizado":    { fill: "#8B7BD8", label: "Finalizado" },
    "default":       { fill: "#98A2B3", label: "Sin estado" }
  },

  // ---------------------------------------------------------------------
  // LAYOUT DEL TIMELINE
  // ---------------------------------------------------------------------
  LAYOUT: {
    margin: { top: 24, right: 32, bottom: 40, left: 220 },
    rowHeight: 42,          // alto de cada fila de categoría
    rowGap: 4,              // separación vertical entre filas
    markerRadius: 6,        // radio del punto de cada hito
    markerRadiusHover: 8,
    minPixelGap: 16,        // separación horizontal mínima antes de acomodar en grilla
    initialZoom: 1,
    minZoom: 0.6,
    maxZoom: 60
  },

  // ---------------------------------------------------------------------
  // COMPORTAMIENTO
  // ---------------------------------------------------------------------
  SEARCH_DEBOUNCE_MS: 180,
  RESIZE_DEBOUNCE_MS: 150,

  // ---------------------------------------------------------------------
  // TEXTOS DE LA INTERFAZ
  // ---------------------------------------------------------------------
  UI_TEXT: {
    appTitle: "Línea de tiempo",
    searchPlaceholder: "Buscar por título, texto, categoría, subcategoría o fuente…",
    filtersTitle: "Filtros",
    categoriaLabel: "Categoría",
    subcategoriaLabel: "Subcategoría",
    estadoLabel: "Estado",
    anioLabel: "Año",
    fuenteLabel: "Fuente",
    clearFiltersLabel: "Limpiar filtros",
    resultsCountSuffix: "hitos",
    loadingMessage: "Cargando datos del Google Sheet…",
    errorMessage: "No se pudo leer el Google Sheet. Revisá config.js y el README.",
    emptyMessage: "Ningún hito coincide con los filtros/búsqueda actuales.",
    detailPanelClose: "Cerrar"
  }
};
