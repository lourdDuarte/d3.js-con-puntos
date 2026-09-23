/**
 * app.js
 * ---------------------------------------------------------------------------
 * Lógica completa de la aplicación:
 *   1. Lectura en vivo del Google Sheet (CSV) y normalización de filas.
 *   2. Estado de filtros + búsqueda.
 *   3. Layout del timeline (filas por Categoría, columnas por tiempo) con
 *      separación anti-superposición recalculada dinámicamente en cada
 *      zoom/pan. Cada hito se dibuja SIEMPRE como un punto individual
 *      (nunca se agrupan en un marcador con contador); cuando varios
 *      hitos caen muy cerca en X, se acomodan en una pequeña grilla para
 *      minimizar la superposición sin dejar de mostrarlos a todos.
 *   4. Render con D3 (zoom, tooltip, panel de detalle).
 *   5. Sidebar de filtros, buscador, leyenda de Estado, responsive.
 * No depende de TimelineJS ni de Knight Lab: solo D3.js + PapaParse.
 * ---------------------------------------------------------------------------
 */

(function () {
  "use strict";

  // =========================================================================
  // 0. UTILIDADES
  // =========================================================================

  function debounce(fn, ms) {
    let t = null;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function normalizeForSearch(str) {
    if (!str) return "";
    return str
      .toString()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();
  }

  function trimHeader(h) {
    return (h || "").toString().trim();
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return str
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function estadoColor(estado) {
    return (CONFIG.COLORS_BY_ESTADO[estado] || CONFIG.COLORS_BY_ESTADO.default);
  }

  // Busca en CONFIG.IMAGE_OVERRIDES si el hito (Año + Título exacto) tiene
  // una imagen asignada manualmente. Devuelve el objeto { src, alt } o
  // null si no hay ninguna para ese hito.
  function findImageOverride(anio, headline) {
    const list = CONFIG.IMAGE_OVERRIDES || [];
    const match = list.find(
      (o) => o.anio === anio && o.titulo.trim() === headline.trim()
    );
    return match ? { src: match.src, alt: match.alt || "" } : null;
  }

  // =========================================================================
  // 1. CARGA DE DATOS DESDE GOOGLE SHEETS
  // =========================================================================

  function fetchCsvText(url) {
    return fetch(url, { cache: "no-store" }).then((res) => {
      if (!res.ok) throw new Error("HTTP " + res.status + " al pedir el Sheet");
      return res.text();
    });
  }

  /**
   * Intenta primero la fuente preferida (config.PREFERRED_SOURCE); si falla
   * (red, CORS, o el Sheet publicado no está configurado), intenta con la
   * otra fuente disponible automáticamente.
   */
  function fetchSheetCsv() {
    const gvizUrl = CONFIG.GVIZ_CSV_URL;
    const publishedUrl = (CONFIG.PUBLISHED_CSV_URL || "").trim();

    const sources =
      CONFIG.PREFERRED_SOURCE === "published"
        ? [publishedUrl, gvizUrl]
        : [gvizUrl, publishedUrl];

    const usable = sources.filter((u) => !!u);

    function tryNext(i) {
      if (i >= usable.length) {
        return Promise.reject(
          new Error(
            "No se pudo leer el Google Sheet desde ninguna de las fuentes configuradas."
          )
        );
      }
      return fetchCsvText(usable[i]).catch((err) => {
        console.warn("Falló la fuente de datos:", usable[i], err);
        return tryNext(i + 1);
      });
    }

    return tryNext(0);
  }

  function parseCsv(csvText) {
    const parsed = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: trimHeader,
    });
    if (parsed.errors && parsed.errors.length) {
      // PapaParse reporta errores "leves" (p.ej. filas con campos de más)
      // con bastante frecuencia en CSVs reales; se registran pero no se
      // aborta la carga mientras haya filas utilizables.
      console.warn("Advertencias al parsear el CSV:", parsed.errors);
    }
    return parsed.data;
  }

  function normalizeRows(rawRows) {
    const c = CONFIG.COLUMNS;
    const events = [];
    let skipped = 0;

    rawRows.forEach((row, i) => {
      const anioRaw = (row[c.anio] || "").toString().trim();
      const anio = parseInt(anioRaw, 10);
      const headline = (row[c.headline] || "").toString().trim();
      const categoria = (row[c.categoria] || "").toString().trim() || "Sin categoría";

      if (!anioRaw || Number.isNaN(anio) || !headline) {
        skipped += 1;
        return;
      }

      events.push({
        id: "evt-" + i,
        anio: anio,
        categoria: categoria,
        subcategoria: (row[c.subcategoria] || "").toString().trim(),
        headline: headline,
        text: (row[c.text] || "").toString().trim(),
        fuente: (row[c.fuente] || "").toString().trim(),
        estado: (row[c.estado] || "").toString().trim() || "default",
        imagen: findImageOverride(anio, headline),
        rowOrder: i,
        searchBlob: normalizeForSearch(
          [
            headline,
            row[c.text],
            categoria,
            row[c.subcategoria],
            row[c.fuente],
          ]
            .filter(Boolean)
            .join(" | ")
        ),
      });
    });

    return { events, skipped };
  }

  // =========================================================================
  // 2. ESTADO GLOBAL DE LA APP
  // =========================================================================

  const state = {
    allEvents: [],
    categorias: [], // [{value, count}]
    subcategorias: [],
    estados: [],
    fuentes: [],
    anioMin: 0,
    anioMax: 0,

    filters: {
      categoria: new Set(),
      subcategoria: new Set(),
      estado: new Set(),
      fuente: new Set(),
      anioMin: null,
      anioMax: null,
    },
    searchQuery: "",

    // Layout D3
    rows: [], // categorías en orden de fila
    xScaleBase: null,
    xScaleCurrent: null,
    zoomBehavior: null,
    svgSel: null,
    plotG: null,
    markersG: null,
    axisG: null,
    innerWidth: 0,
    innerHeight: 0,
  };

  // =========================================================================
  // 3. CONSTRUCCIÓN DE LISTAS DE FILTROS
  // =========================================================================

  function buildFacet(events, key) {
    const counts = new Map();
    events.forEach((e) => {
      const v = e[key];
      if (!v) return;
      counts.set(v, (counts.get(v) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "es"));
  }

  function computeFacets() {
    state.categorias = buildFacet(state.allEvents, "categoria");
    state.subcategorias = buildFacet(
      state.allEvents.filter((e) => e.subcategoria),
      "subcategoria"
    );
    state.estados = buildFacet(state.allEvents, "estado");
    state.fuentes = buildFacet(state.allEvents, "fuente");

    const anios = state.allEvents.map((e) => e.anio);
    state.anioMin = Math.min(...anios);
    state.anioMax = Math.max(...anios);
    state.filters.anioMin = state.anioMin;
    state.filters.anioMax = state.anioMax;
  }

  // =========================================================================
  // 4. FILTRADO + BÚSQUEDA
  // =========================================================================

  function getFilteredEvents() {
    const f = state.filters;
    const q = state.searchQuery;

    return state.allEvents.filter((e) => {
      if (f.categoria.size && !f.categoria.has(e.categoria)) return false;
      if (f.subcategoria.size && !f.subcategoria.has(e.subcategoria)) return false;
      if (f.estado.size && !f.estado.has(e.estado)) return false;
      if (f.fuente.size && !f.fuente.has(e.fuente)) return false;
      if (f.anioMin !== null && e.anio < f.anioMin) return false;
      if (f.anioMax !== null && e.anio > f.anioMax) return false;
      if (q && !e.searchBlob.includes(q)) return false;
      return true;
    });
  }

  // =========================================================================
  // 5. LAYOUT DEL TIMELINE
  // =========================================================================

  function buildRows(events) {
    // Filas = categorías presentes en el conjunto filtrado, en orden
    // alfabético estable (independiente del filtro, para que no "salten"
    // de posición al filtrar).
    const set = new Set(events.map((e) => e.categoria));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }

  function rowIndexMap(rows) {
    const m = new Map();
    rows.forEach((r, i) => m.set(r, i));
    return m;
  }

  /**
   * Agrupa los eventos visibles en "buckets" de píxeles dentro de cada fila,
   * usando la escala X actual (ya con el zoom/pan aplicado). Cada evento se
   * dibuja SIEMPRE como un punto individual: nunca se reemplazan varios
   * eventos por un único marcador con contador. Para minimizar la
   * superposición dentro de un mismo bucket, los puntos se acomodan en una
   * pequeña grilla (varias columnas x varias filas) centrada en la posición
   * horizontal promedio del bucket, en lugar de apilarse en una sola
   * columna vertical sin límite.
   */
  function computeLayout(events, xScale, rowIdx) {
    const L = CONFIG.LAYOUT;
    const buckets = new Map(); // key -> array de eventos

    events.forEach((e) => {
      const ri = rowIdx.get(e.categoria);
      if (ri === undefined) return;
      const px = xScale(e.anio + (e.rowOrder % 1000) / 100000);
      const bucketX = Math.round(px / L.minPixelGap);
      const key = ri + ":" + bucketX;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push({ e, px, ri });
    });

    const items = [];
    const step = L.markerRadius * 2.3; // separación entre puntos vecinos (x e y)

    buckets.forEach((arr) => {
      const ri = arr[0].ri;
      const avgPx = arr.reduce((s, it) => s + it.px, 0) / arr.length;
      const rowY =
        L.margin.top + ri * (L.rowHeight + L.rowGap) + L.rowHeight / 2;
      const n = arr.length;

      // Cuántas filas verticales de puntos entran dentro de la banda de la
      // categoría sin invadir la fila de al lado.
      const maxRowsInBand = Math.max(
        1,
        Math.floor((L.rowHeight - L.markerRadius * 2) / step)
      );
      const cols = Math.ceil(n / maxRowsInBand);
      const rowsUsed = Math.ceil(n / cols);

      arr.forEach((it, i) => {
        const col = Math.floor(i / rowsUsed);
        const rowInCol = i % rowsUsed;
        const colOffset = (col - (cols - 1) / 2) * step;
        const rowOffset = (rowInCol - (rowsUsed - 1) / 2) * step;
        items.push({
          type: "marker",
          key: it.e.id,
          event: it.e,
          x: avgPx + colOffset,
          y: rowY + rowOffset,
        });
      });
    });

    return items;
  }

  // =========================================================================
  // 6. RENDER: ESTRUCTURA BASE DEL SVG
  // =========================================================================

  function getTimelineSize() {
    const wrapper = document.getElementById("timeline-wrapper");
    const rect = wrapper.getBoundingClientRect();
    return { width: Math.max(rect.width, 320), height: Math.max(rect.height, 240) };
  }

  // El margen izquierdo aloja las etiquetas de categoría; en pantallas
  // angostas se reduce para no comerse casi todo el ancho disponible.
  function getEffectiveMargin(width) {
    const L = CONFIG.LAYOUT;
    if (width < 480) return { ...L.margin, left: 88 };
    if (width < 768) return { ...L.margin, left: 130 };
    return L.margin;
  }

  function setupSvg() {
    const { width, height } = getTimelineSize();
    const margin = getEffectiveMargin(width);
    state.margin = margin;

    const svg = d3.select("#timeline-svg");
    svg.selectAll("*").remove();
    svg.attr("width", width).attr("height", height);

    state.innerWidth = width - margin.left - margin.right;
    state.innerHeight = height - margin.top - margin.bottom;

    const defsClip = svg.append("defs").append("clipPath").attr("id", "plot-clip");
    defsClip
      .append("rect")
      .attr("width", Math.max(state.innerWidth, 0))
      .attr("height", height);

    // Etiquetas de fila (fuera del área con clip, para que no se corten
    // al hacer pan horizontal)
    const labelsG = svg
      .append("g")
      .attr("class", "labels-layer")
      .attr("transform", `translate(${margin.left - 12},${margin.top})`);

    const plotG = svg
      .append("g")
      .attr("class", "plot-layer")
      .attr("transform", `translate(${margin.left},${margin.top})`)
      .attr("clip-path", "url(#plot-clip)");

    plotG.append("g").attr("class", "bands-layer");
    plotG.append("g").attr("class", "gridlines-layer");
    const axisG = svg
      .append("g")
      .attr("class", "axis axis--x")
      .attr("transform", `translate(${margin.left},${margin.top + state.innerHeight})`);
    const markersG = plotG.append("g").attr("class", "markers-layer");

    state.svgSel = svg;
    state.plotG = plotG;
    state.markersG = markersG;
    state.axisG = axisG;
    state.labelsG = labelsG;

    return svg;
  }

  // Trunca (agregando "…") el nodo de texto visible `textNode` dentro del
  // elemento <text> `el`, para que el ancho renderizado entre en maxWidth
  // (px). No toca otros hijos del elemento (p. ej. <title>).
  function truncateSvgTextNode(el, textNode, maxWidth) {
    if (el.getComputedTextLength() <= maxWidth) return;
    let text = textNode.textContent;
    while (text.length > 1 && el.getComputedTextLength() > maxWidth) {
      text = text.slice(0, -1);
      textNode.textContent = text + "…";
    }
  }

  function drawRowBandsAndLabels(rows) {
    const L = CONFIG.LAYOUT;
    const margin = state.margin || L.margin;
    // Ancho disponible para el texto de la etiqueta: el margen izquierdo
    // menos el desplazamiento de la capa de etiquetas (12px) y un pequeño
    // respiro adicional.
    const maxLabelWidth = Math.max(margin.left - 12 - 8, 32);

    const bands = state.plotG
      .select(".bands-layer")
      .selectAll("rect")
      .data(rows, (d) => d);

    bands
      .join("rect")
      .attr("class", (d, i) => "row-band" + (i % 2 ? " row-band--alt" : ""))
      .attr("x", -20000)
      .attr("width", 40000)
      .attr("y", (d, i) => L.margin.top + i * (L.rowHeight + L.rowGap) - L.margin.top)
      .attr("height", L.rowHeight);

    const labels = state.labelsG.selectAll("text").data(rows, (d) => d);

    labels
      .join((enter) => {
        const t = enter
          .append("text")
          .attr("class", "row-label")
          .attr("text-anchor", "end")
          .attr("x", 0)
          .attr("dominant-baseline", "central");
        t.append("title");
        return t;
      })
      .attr("y", (d, i) => i * (L.rowHeight + L.rowGap) + L.rowHeight / 2)
      .each(function (d) {
        const node = d3.select(this);
        const full = String(d).toUpperCase();
        // <title>: nombre completo, para lectores de pantalla y para ver
        // el nombre entero al tocar/pasar el mouse cuando queda truncado.
        node.select("title").text(full);
        // Nodo de texto visible (separado del <title>).
        let textNode = null;
        for (const child of this.childNodes) {
          if (child.nodeType === 3) {
            textNode = child;
            break;
          }
        }
        if (!textNode) {
          textNode = document.createTextNode("");
          this.appendChild(textNode);
        }
        textNode.textContent = full;
        truncateSvgTextNode(this, textNode, maxLabelWidth);
      });
  }

  function drawAxis(xScale) {
    const axis = d3
      .axisBottom(xScale)
      .tickFormat((d) => Math.round(d).toString())
      .ticks(Math.max(state.innerWidth / 70, 2));
    state.axisG.call(axis);
  }

  // =========================================================================
  // 7. RENDER: MARCADORES (llamado en cada zoom/pan/filtro)
  // =========================================================================

  function renderMarkers() {
    const events = getFilteredEvents();
    state.rows = buildRows(events);
    const ridx = rowIndexMap(state.rows);

    drawRowBandsAndLabels(state.rows);

    // Reajustar alto del SVG según cantidad de filas
    const L = CONFIG.LAYOUT;
    const neededHeight =
      L.margin.top + state.rows.length * (L.rowHeight + L.rowGap) + L.margin.bottom;
    const { width } = getTimelineSize();
    const finalHeight = Math.max(neededHeight, getTimelineSize().height);
    state.svgSel.attr("height", finalHeight);
    state.axisG.attr(
      "transform",
      `translate(${state.margin.left},${finalHeight - state.margin.bottom})`
    );

    const items = computeLayout(events, state.xScaleCurrent, ridx);

    // Todos los ítems son puntos individuales: nunca se reemplazan varios
    // hitos por un marcador con contador. Un punto por cada hito, siempre.
    const sel = state.markersG.selectAll(".marker").data(items, (d) => d.key);

    sel.exit().remove();

    sel.enter().append("circle").attr("class", "marker");

    const merged = state.markersG.selectAll(".marker");

    merged
      .attr("r", CONFIG.LAYOUT.markerRadius)
      .attr("cx", (d) => d.x)
      .attr("cy", (d) => d.y)
      .attr("fill", (d) => estadoColor(d.event.estado).fill)
      .classed("marker--has-image", (d) => !!d.event.imagen)
      .on("mouseenter", (evt, d) => showTooltip(evt, d.event))
      .on("mousemove", (evt) => moveTooltip(evt))
      .on("mouseleave", hideTooltip)
      .on("click", (evt, d) => openDetailPanel(d.event));

    updateResultsCount(events.length);
  }

  // =========================================================================
  // 8. ZOOM / PAN
  // =========================================================================

  function initZoom() {
    const L = CONFIG.LAYOUT;
    state.zoomBehavior = d3
      .zoom()
      .scaleExtent([L.minZoom, L.maxZoom])
      .on("zoom", (event) => {
        state.xScaleCurrent = event.transform.rescaleX(state.xScaleBase);
        drawAxis(state.xScaleCurrent);
        renderMarkers();
      })
      .on("start", () => state.svgSel.classed("grabbing", true))
      .on("end", () => state.svgSel.classed("grabbing", false));

    state.svgSel.call(state.zoomBehavior);
  }

  function resetZoom() {
    state.svgSel
      .transition()
      .duration(300)
      .call(state.zoomBehavior.transform, d3.zoomIdentity);
  }

  function zoomBy(factor) {
    state.svgSel
      .transition()
      .duration(250)
      .call(state.zoomBehavior.scaleBy, factor);
  }

  // =========================================================================
  // 9. TOOLTIP
  // =========================================================================

  function showTooltip(event, e) {
    const tip = document.getElementById("tooltip");
    tip.innerHTML =
      `<div class="tooltip__headline">${escapeHtml(e.headline)}</div>` +
      `<div class="tooltip__meta">${escapeHtml(e.estado)} · ${escapeHtml(e.categoria)} · ${e.anio}</div>` +
      (e.imagen ? `<div class="tooltip__hint">🖼 Tiene imagen — click para verla</div>` : "");
    tip.hidden = false;
    moveTooltip(event);
  }

  function moveTooltip(event) {
    const tip = document.getElementById("tooltip");
    const pad = 14;
    let x = event.clientX + pad;
    let y = event.clientY + pad;
    const maxX = window.innerWidth - 320;
    const maxY = window.innerHeight - 100;
    if (x > maxX) x = event.clientX - pad - 280;
    if (y > maxY) y = event.clientY - pad - 60;
    tip.style.left = x + "px";
    tip.style.top = y + "px";
  }

  function hideTooltip() {
    document.getElementById("tooltip").hidden = true;
  }

  // =========================================================================
  // 10. PANEL DE DETALLE
  // =========================================================================

  function openDetailPanel(e) {
    const panel = document.getElementById("detail-panel");
    const backdrop = document.getElementById("detail-backdrop");
    const content = document.getElementById("detail-content");
    const color = estadoColor(e.estado);

    content.innerHTML = `
      <div class="detail-badge" style="background:${color.fill}22; color:${color.fill};">
        <span class="detail-badge__dot" style="background:${color.fill};"></span>
        ${escapeHtml(e.estado)}
      </div>
      <h2 class="detail-panel__headline">${escapeHtml(e.headline)}</h2>

      ${
        e.imagen
          ? `<div class="detail-field detail-field__image">
               <img src="${escapeHtml(e.imagen.src)}" alt="${escapeHtml(e.imagen.alt)}" loading="lazy">
             </div>`
          : ""
      }

      <div class="detail-field">
        <div class="detail-field__label">Año</div>
        <div class="detail-field__value">${e.anio}</div>
      </div>

      <div class="detail-field">
        <div class="detail-field__label">Categoría</div>
        <div class="detail-field__value">${escapeHtml(e.categoria)}</div>
      </div>

      ${
        e.subcategoria
          ? `<div class="detail-field">
               <div class="detail-field__label">Subcategoría</div>
               <div class="detail-field__value">${escapeHtml(e.subcategoria)}</div>
             </div>`
          : ""
      }

      <div class="detail-field">
        <div class="detail-field__label">Texto completo</div>
        <div class="detail-field__value">${
          e.text ? escapeHtml(e.text) : '<span class="detail-field__value--muted">Sin texto</span>'
        }</div>
      </div>

      <div class="detail-field">
        <div class="detail-field__label">Fuente</div>
        <div class="detail-field__value">${
          e.fuente ? escapeHtml(e.fuente) : '<span class="detail-field__value--muted">Sin fuente</span>'
        }</div>
      </div>
    `;

    panel.hidden = false;
    panel.setAttribute("aria-hidden", "false");
    backdrop.hidden = false;
    requestAnimationFrame(() => {
      panel.classList.add("open");
    });
  }

  function closeDetailPanel() {
    const panel = document.getElementById("detail-panel");
    const backdrop = document.getElementById("detail-backdrop");
    panel.hidden = true;
    panel.setAttribute("aria-hidden", "true");
    backdrop.hidden = true;
  }

  // =========================================================================
  // 11. SIDEBAR: FILTROS
  // =========================================================================

  function renderChecklistFilter(containerId, facetList, filterKey, withSwatch) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";

    facetList.forEach((item) => {
      const id = containerId + "-" + item.value.replace(/[^a-zA-Z0-9]/g, "_");
      const label = document.createElement("label");
      label.className = "filter-option";
      label.setAttribute("for", id);

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = id;
      checkbox.checked = state.filters[filterKey].has(item.value);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) state.filters[filterKey].add(item.value);
        else state.filters[filterKey].delete(item.value);
        renderMarkers();
      });

      label.appendChild(checkbox);

      if (withSwatch) {
        const swatch = document.createElement("span");
        swatch.className = "filter-option__swatch";
        swatch.style.background = estadoColor(item.value).fill;
        label.appendChild(swatch);
      }

      const text = document.createElement("span");
      text.className = "filter-option__label";
      text.textContent = item.value;
      label.appendChild(text);

      const count = document.createElement("span");
      count.className = "filter-option__count";
      count.textContent = item.count;
      label.appendChild(count);

      container.appendChild(label);
    });
  }

  function renderAllFilters() {
    renderChecklistFilter("filter-categoria", state.categorias, "categoria", false);
    renderChecklistFilter("filter-subcategoria", state.subcategorias, "subcategoria", false);
    renderChecklistFilter("filter-estado", state.estados, "estado", true);
    renderChecklistFilter("filter-fuente", state.fuentes, "fuente", false);
    setupAnioRange();
  }

  function setupAnioRange() {
    const min = state.anioMin;
    const max = state.anioMax;
    const minInput = document.getElementById("anio-min");
    const maxInput = document.getElementById("anio-max");
    const minLabel = document.getElementById("anio-min-label");
    const maxLabel = document.getElementById("anio-max-label");
    const fill = document.getElementById("anio-range-fill");

    [minInput, maxInput].forEach((inp) => {
      inp.min = min;
      inp.max = max;
      inp.step = 1;
    });
    minInput.value = state.filters.anioMin;
    maxInput.value = state.filters.anioMax;

    function updateFillAndLabels() {
      const lo = Math.min(Number(minInput.value), Number(maxInput.value));
      const hi = Math.max(Number(minInput.value), Number(maxInput.value));
      minLabel.textContent = lo;
      maxLabel.textContent = hi;
      const pctLo = max > min ? ((lo - min) / (max - min)) * 100 : 0;
      const pctHi = max > min ? ((hi - min) / (max - min)) * 100 : 100;
      fill.style.left = pctLo + "%";
      fill.style.width = Math.max(pctHi - pctLo, 0) + "%";
    }
    updateFillAndLabels();

    function onInput() {
      const lo = Math.min(Number(minInput.value), Number(maxInput.value));
      const hi = Math.max(Number(minInput.value), Number(maxInput.value));
      state.filters.anioMin = lo;
      state.filters.anioMax = hi;
      updateFillAndLabels();
      renderMarkers();
    }

    minInput.oninput = onInput;
    maxInput.oninput = onInput;
  }

  function clearAllFilters() {
    state.filters.categoria.clear();
    state.filters.subcategoria.clear();
    state.filters.estado.clear();
    state.filters.fuente.clear();
    state.filters.anioMin = state.anioMin;
    state.filters.anioMax = state.anioMax;
    document.getElementById("search-input").value = "";
    state.searchQuery = "";
    document.getElementById("search-clear").hidden = true;
    renderAllFilters();
    renderMarkers();
  }

  // =========================================================================
  // 12. LEYENDA DE ESTADO
  // =========================================================================

  function renderLegend() {
    const container = document.getElementById("estado-legend");
    container.innerHTML = "";
    state.estados.forEach((item) => {
      const color = estadoColor(item.value);
      const el = document.createElement("div");
      el.className = "legend-item";
      el.innerHTML = `<span class="legend-item__swatch" style="background:${color.fill}"></span>${escapeHtml(
        item.value
      )}`;
      container.appendChild(el);
    });
  }

  // =========================================================================
  // 13. RESULTADOS / ESTADO DE CARGA
  // =========================================================================

  function updateResultsCount(n) {
    document.getElementById("results-count").textContent =
      n + " " + CONFIG.UI_TEXT.resultsCountSuffix;
  }

  function showBanner(message, isError) {
    const banner = document.getElementById("status-banner");
    banner.textContent = message;
    banner.hidden = false;
    banner.classList.toggle("status-banner--error", !!isError);
  }

  function hideBanner() {
    document.getElementById("status-banner").hidden = true;
  }

  // =========================================================================
  // 14. INICIALIZACIÓN GENERAL
  // =========================================================================

  function initXScaleBase() {
    const pad = 0.6;
    state.xScaleBase = d3
      .scaleLinear()
      .domain([state.anioMin - pad, state.anioMax + pad])
      .range([0, state.innerWidth]);
    state.xScaleCurrent = state.xScaleBase.copy();
  }

  function rerenderAll() {
    setupSvg();
    initXScaleBase();
    initZoom();
    drawAxis(state.xScaleCurrent);
    renderMarkers();
  }

  function wireStaticUi() {
    // Buscador
    const searchInput = document.getElementById("search-input");
    const searchClear = document.getElementById("search-clear");
    const applySearch = debounce((value) => {
      state.searchQuery = normalizeForSearch(value);
      renderMarkers();
    }, CONFIG.SEARCH_DEBOUNCE_MS);

    searchInput.addEventListener("input", (ev) => {
      const v = ev.target.value;
      searchClear.hidden = v.length === 0;
      applySearch(v);
    });
    searchClear.addEventListener("click", () => {
      searchInput.value = "";
      searchClear.hidden = true;
      state.searchQuery = "";
      renderMarkers();
      searchInput.focus();
    });

    // Grupos de filtros colapsables
    document.querySelectorAll(".filter-group__header").forEach((btn) => {
      btn.addEventListener("click", () => {
        const expanded = btn.getAttribute("aria-expanded") === "true";
        btn.setAttribute("aria-expanded", String(!expanded));
      });
    });

    document.getElementById("clear-filters").addEventListener("click", clearAllFilters);

    // Zoom toolbar
    document.getElementById("zoom-in").addEventListener("click", () => zoomBy(1.6));
    document.getElementById("zoom-out").addEventListener("click", () => zoomBy(1 / 1.6));
    document.getElementById("zoom-reset").addEventListener("click", resetZoom);

    // Panel de detalle
    document.getElementById("detail-close").addEventListener("click", closeDetailPanel);
    document.getElementById("detail-backdrop").addEventListener("click", closeDetailPanel);
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") {
        closeDetailPanel();
        closeSidebarMobile();
      }
    });

    // Sidebar responsive
    const sidebar = document.getElementById("sidebar");
    const sidebarBackdrop = document.getElementById("sidebar-backdrop");
    const filtersToggle = document.getElementById("filters-toggle");

    function openSidebarMobile() {
      sidebar.classList.add("open");
      sidebarBackdrop.classList.add("open");
      filtersToggle.setAttribute("aria-expanded", "true");
    }
    function closeSidebarMobile() {
      sidebar.classList.remove("open");
      sidebarBackdrop.classList.remove("open");
      filtersToggle.setAttribute("aria-expanded", "false");
    }
    filtersToggle.addEventListener("click", () => {
      const isOpen = sidebar.classList.contains("open");
      if (isOpen) closeSidebarMobile();
      else openSidebarMobile();
    });
    sidebarBackdrop.addEventListener("click", closeSidebarMobile);

    // Resize
    window.addEventListener(
      "resize",
      debounce(() => {
        rerenderAll();
      }, CONFIG.RESIZE_DEBOUNCE_MS)
    );

    // Título y placeholder desde config
    document.getElementById("app-title").textContent = CONFIG.UI_TEXT.appTitle;
    document.title = CONFIG.UI_TEXT.appTitle;
    searchInput.placeholder = CONFIG.UI_TEXT.searchPlaceholder;
  }

  function loadAndStart() {
    showBanner(CONFIG.UI_TEXT.loadingMessage, false);

    fetchSheetCsv()
      .then((csvText) => {
        const rawRows = parseCsv(csvText);
        const { events, skipped } = normalizeRows(rawRows);

        if (!events.length) {
          throw new Error("El Sheet se leyó correctamente pero no contiene filas utilizables.");
        }

        state.allEvents = events;
        computeFacets();
        renderAllFilters();
        renderLegend();
        rerenderAll();

        if (skipped > 0) {
          showBanner(
            `Se cargaron ${events.length} hitos. ${skipped} fila(s) se omitieron por no tener Año o Título.`,
            false
          );
        } else {
          hideBanner();
        }

        if (CONFIG.AUTO_REFRESH_MS && CONFIG.AUTO_REFRESH_MS > 0) {
          setInterval(refreshData, CONFIG.AUTO_REFRESH_MS);
        }
      })
      .catch((err) => {
        console.error(err);
        showBanner(CONFIG.UI_TEXT.errorMessage + " (" + err.message + ")", true);
      });
  }

  function refreshData() {
    fetchSheetCsv()
      .then((csvText) => {
        const rawRows = parseCsv(csvText);
        const { events } = normalizeRows(rawRows);
        if (!events.length) return;
        state.allEvents = events;
        computeFacets();
        renderAllFilters();
        renderLegend();
        renderMarkers();
      })
      .catch((err) => {
        console.warn("Falló la actualización automática del Sheet:", err);
      });
  }

  document.addEventListener("DOMContentLoaded", () => {
    wireStaticUi();
    loadAndStart();
  });
})();
