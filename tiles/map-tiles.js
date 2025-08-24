// Tiles Map Module
// Интеграция со старой навигацией (3 иконки)

// === Edge Function ===
const ADD_EVENT_URL = 'https://ttcwdasslhvkdulqwzte.supabase.co/functions/v1/add-event';
// ⬇️ твой анонимный ключ проекта (оставь как есть, если уже подставлен сборщиком)
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0Y3dkYXNzbGh2a2R1bHF3enRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1NDU0MzQsImV4cCI6MjA3MTEyMTQzNH0.olNpZvqAU5XQbP8Owy1fCl0oCZaVIPXUH89PP8kwNPk';

class TilesMap {
  constructor(container) {
    this.container = container;
    this.map = null;
    this.myLayer = null;
    this.baseLayers = {};
    this.currentBaseLayer = null;
    this.logInterval = null;
    this.isInitialized = false;
    this.currentMode = 'yin'; // yin | light | dark

    this.FN_GET = 'https://ttcwdasslhvkdulqwzte.supabase.co/functions/v1/get-tiles';
    this.FN_GEN = 'https://ttcwdasslhvkdulqwzte.supabase.co/functions/v1/generate-tiles-hourly';

    this.MAX_BOUNDS = null;
  }

  // ---------- public API ----------
  async init() {
    if (this.isInitialized) return;

    try {
      // границы мира (без Антарктиды)
      this.MAX_BOUNDS = L.latLngBounds(L.latLng(-58, -180), L.latLng(75, 180));

      // контейнеры
      this.createMapContainer();

      // карта
      this.map = L.map(this.mapElement, {
        maxBounds: this.MAX_BOUNDS,
        maxBoundsViscosity: 1.0,
        worldCopyJump: false,
        zoomControl: true,
        scrollWheelZoom: true,
        attributionControl: false,
        minZoom: 1,
        maxZoom: 8,
        zoom: 1,
        center: [20, 0],
      });

      // базовые слои + fallback
      this.createBaseLayers();

      // подключаем слой только когда карта готова
      this.map.whenReady(() => {
        const savedMode = localStorage.getItem('mapBase') || 'dark';
        this.setMode(savedMode);
        // если верстка была отложенной — пробиваем расчёт размеров
        this.map.invalidateSize(true);
      });

      // мой слой (тайлы событий)
      this.createMyDataLayer();

      // слой "живых" точек поверх
      this.createLivePane();

      // обработчики long-press
      this.setupLongPressHandlers();

      // логирование
      this.startLogging();

      this.isInitialized = true;
      console.info('[Map] initialized');
    } catch (err) {
      console.error('[TILES] Failed to initialize map:', err);
      throw err;
    }
  }

  destroy() {
    if (this.logInterval) { clearInterval(this.logInterval); this.logInterval = null; }
    if (this.map) { this.map.remove(); this.map = null; }
    if (this.mapContainer && this.mapContainer.parentNode) {
      this.mapContainer.parentNode.removeChild(this.mapContainer);
    }
    this.isInitialized = false;
    console.info('[TILES] Map destroyed');
  }

  async generateTiles() {
    try {
      const response = await fetch(this.FN_GEN, { method: 'POST' });
      const result = await response.text();
      console.info('[Tiles] generate:', response.status, result);
      if (this.myLayer && this.map.hasLayer(this.myLayer)) this.myLayer.redraw();
    } catch (error) {
      console.error('[Tiles] generate error:', error);
    }
  }

  // ---------- structure ----------
  createMapContainer() {
    this.mapContainer = document.createElement('div');
    this.mapContainer.className = 'tiles-map-container';

    this.mapElement = document.createElement('div');
    this.mapElement.className = 'tiles-map';
    // на всякий случай, чтобы не схлопывалась
    this.mapElement.style.minHeight = '220px';

    this.mapContainer.appendChild(this.mapElement);
    this.container.appendChild(this.mapContainer);
  }

  createBaseLayers() {
    const cartoLight = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      { subdomains: 'abcd', noWrap: true, bounds: this.MAX_BOUNDS, updateWhenIdle: true },
    );
    const cartoDark = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      { subdomains: 'abcd', noWrap: true, bounds: this.MAX_BOUNDS, updateWhenIdle: true },
    );
    const osm = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { subdomains: 'abc', noWrap: true, bounds: this.MAX_BOUNDS, updateWhenIdle: true },
    );

    // при ошибке загрузки любого тайла — мягкий переход на OSM
    const addFallback = (layer) => {
      layer.on('tileerror', () => {
        if (!this.map || this.map.hasLayer(osm)) return;
        console.warn('[Map] tileerror -> switch to OSM fallback');
        if (this.currentBaseLayer) this.map.removeLayer(this.currentBaseLayer);
        this.currentBaseLayer = osm;
        this.currentBaseLayer.addTo(this.map);
      });
      return layer;
    };

    this.baseLayers = {
      cartoLight: addFallback(cartoLight),
      cartoDark: addFallback(cartoDark),
      osm,
    };
  }

  setMode(mode) {
    // убрать прежний слой
    if (this.currentBaseLayer) {
      this.map.removeLayer(this.currentBaseLayer);
      this.currentBaseLayer = null;
    }

    this.currentMode = mode;
    const mapWrap = document.getElementById('mapWrap') || document.getElementById('mapSection');

    if (mode === 'yin') {
      // показать старую карту
      this.mapContainer.style.display = 'none';
      if (mapWrap) mapWrap.classList.add('map--yin');

      const vmap = document.getElementById('vmap');
      const yinCanvas = document.getElementById('yinCanvas');
      if (vmap) vmap.style.display = 'block';
      if (yinCanvas) yinCanvas.style.display = 'block';

      setTimeout(() => {
        if (typeof syncCanvasSize === 'function') syncCanvasSize();
        if (typeof drawYinYang === 'function') drawYinYang();
        if (typeof startYinAnimation === 'function') startYinAnimation();
        if (typeof createTestMeditations === 'function') createTestMeditations();
      }, 100);
    } else {
      // показать Leaflet
      this.mapContainer.style.display = 'block';
      if (mapWrap) mapWrap.classList.remove('map--yin');

      const vmap = document.getElementById('vmap');
      const yinCanvas = document.getElementById('yinCanvas');
      if (vmap) vmap.style.display = 'none';
      if (yinCanvas) yinCanvas.style.display = 'none';
      if (typeof stopYinAnimation === 'function') stopYinAnimation();

      // подобрать слой + резерв
      this.currentBaseLayer =
        mode === 'light' ? this.baseLayers.cartoLight :
        mode === 'dark'  ? this.baseLayers.cartoDark  :
                           this.baseLayers.osm;
      if (!this.currentBaseLayer) this.currentBaseLayer = this.baseLayers.osm;
      this.currentBaseLayer.addTo(this.map);

      // карта могла появиться после скрытия — пересчитать размеры
      this.map.invalidateSize(true);
    }

    localStorage.setItem('mapBase', mode);
    this.updateActiveButton(mode);
    console.info(`[Map] mode changed to: ${mode}`);
  }

  updateActiveButton(mode) {
    const buttons = ['btn-yin', 'btn-light', 'btn-dark'];
    buttons.forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.classList.remove('is-active');
    });
    const activeBtn = document.getElementById(`btn-${mode}`);
    if (activeBtn) activeBtn.classList.add('is-active');
  }

  // ---------- data layers ----------
  createMyDataLayer() {
    this.myLayer = L.tileLayer(this.FN_GET + '?z={z}&x={x}&y={y}', {
      noWrap: true,
      bounds: this.MAX_BOUNDS,
      tileSize: 128,
      updateWhenIdle: true,
      crossOrigin: true,
    });
    this.myLayer.addTo(this.map);

    // загрузка последних событий (24ч)
    this.loadExistingEvents();
  }

  createLivePane() {
    this.map.createPane('livePane');
    const livePane = this.map.getPane('livePane');
    livePane.style.zIndex = '650';
    livePane.style.pointerEvents = 'none';

    this.liveLayer = L.layerGroup([], { pane: 'livePane' });
    this.liveLayer.addTo(this.map);
  }

  // ---------- long press ----------
  setupLongPressHandlers() {
    const mapContainer = this.map.getContainer();

    let longPressTimer = null;
    let longPressStart = null;
    const LONG_PRESS_DURATION = 500; // мс
    const MOVE_THRESHOLD = 8; // px

    const handleLongPress = (event) => {
      if (!window.canPlace) return;
      const coords = this.map.mouseEventToLatLng(event);

      const optimistic = this.addOptimisticPoint(coords.lat, coords.lng);
      this.placePoint(coords.lat, coords.lng, optimistic);

      if (window.hidePointTip) window.hidePointTip();
    };

    // mouse
    mapContainer.addEventListener('mousedown', (e) => {
      if (!window.canPlace) return;
      longPressStart = { x: e.clientX, y: e.clientY };
      longPressTimer = setTimeout(() => handleLongPress(e), LONG_PRESS_DURATION);
    });

    mapContainer.addEventListener('mousemove', (e) => {
      if (!longPressStart || !longPressTimer) return;
      const dx = e.clientX - longPressStart.x;
      const dy = e.clientY - longPressStart.y;
      if (Math.hypot(dx, dy) > MOVE_THRESHOLD) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
        longPressStart = null;
      }
    });

    mapContainer.addEventListener('mouseup', () => {
      if (longPressTimer) clearTimeout(longPressTimer);
      longPressTimer = null;
      longPressStart = null;
    });

    // touch
    mapContainer.addEventListener('touchstart', (e) => {
      if (!window.canPlace || e.touches.length !== 1) return;
      e.preventDefault();
      const t = e.touches[0];
      longPressStart = { x: t.clientX, y: t.clientY };
      longPressTimer = setTimeout(() => handleLongPress(t), LONG_PRESS_DURATION);
    }, { passive: false });

    mapContainer.addEventListener('touchmove', (e) => {
      if (!longPressStart || !longPressTimer || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - longPressStart.x;
      const dy = t.clientY - longPressStart.y;
      if (Math.hypot(dx, dy) > MOVE_THRESHOLD) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
        longPressStart = null;
      }
    }, { passive: false });

    mapContainer.addEventListener('touchend', () => {
      if (longPressTimer) clearTimeout(longPressTimer);
      longPressTimer = null;
      longPressStart = null;
    });
  }

  addOptimisticPoint(lat, lng) {
    const marker = L.circleMarker([lat, lng], {
      pane: 'livePane',
      radius: 6,
      color: '#FFC107',
      weight: 2,
      fillColor: '#FFC107',
      fillOpacity: 0.8,
    });

    this.liveLayer.addLayer(marker);

    // быстрое «дыхание»
    let grow = true;
    const id = setInterval(() => {
      const r = marker.getRadius();
      marker.setRadius(grow ? Math.min(10, r + 0.5) : Math.max(6, r - 0.5));
      grow = (r >= 10) ? false : (r <= 6) ? true : grow;
    }, 60);

    return {
      marker,
      cleanup: () => { clearInterval(id); this.liveLayer.removeLayer(marker); },
      fadeOut: () => {
        clearInterval(id);
        let opacity = 0.8;
        const fade = setInterval(() => {
          opacity -= 0.1;
          marker.setStyle({ fillOpacity: Math.max(0, opacity) });
          if (opacity <= 0) { clearInterval(fade); this.liveLayer.removeLayer(marker); }
        }, 100);
      },
      makePermanent: () => {
        clearInterval(id);
        marker.setStyle({ color: '#7FE39A', fillColor: '#7FE39A', fillOpacity: 0.8 });
        let grow = true;
        const slowId = setInterval(() => {
          const r = marker.getRadius();
          marker.setRadius(grow ? Math.min(8, r + 0.3) : Math.max(6, r - 0.3));
          grow = (r >= 8) ? false : (r <= 6) ? true : grow;
        }, 100);
        return () => { clearInterval(slowId); this.liveLayer.removeLayer(marker); };
      },
    };
  }

  // ---------- posting ----------
  async postPoint(lat, lng, clientId, level = 1) {
    const payload = { lat, lng, client_id: clientId, level };

    const resp = await fetch(ADD_EVENT_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      mode: 'cors',
      credentials: 'omit',
      body: JSON.stringify(payload),
    });

    // читаем тело даже при ошибке, чтобы понять причину
    const text = await resp.text().catch(() => '');
    const body = (() => { try { return JSON.parse(text); } catch { return null; } })();

    if (!resp.ok) {
      const err = new Error(`Server ${resp.status}`);
      err.status = resp.status;
      err.body = body;
      throw err;
    }
    return body || {};
  }

  async placePoint(lat, lng, optimisticMarker) {
    try {
      const clientId =
        (typeof window.getClientId === 'function') ? window.getClientId() : 'unknown';

      const res = await this.postPoint(lat, lng, clientId, 1);
      console.log('[POINT] success', res);

      // постоянная зелёная точка
      const cleanup = optimisticMarker.makePermanent();
      if (window.showToast) window.showToast('Точка сохранена на карте!');

      // автоудаление через 10 минут
      setTimeout(() => {
        cleanup();
        console.debug('[POINT] marker auto-removed after 10 minutes');
      }, 10 * 60 * 1000);
    } catch (err) {
      console.warn('[POINT] error', err);
      optimisticMarker.cleanup();

      // дружелюбное сообщение для пользователя
      if (err.status === 429 || (err.body && err.body.error === 'rate_limited')) {
        const tipText =
          'Вы не могли так быстро закончить ещё одну медитацию. ' +
          'Поставить точку на карте можно минимум через 5 минут.';
        this.showBlockingTip(tipText);
      } else if (err.status === 401 || err.status === 403) {
        this.showBlockingTip('Нет доступа для записи точки. Попробуйте перезайти.');
      } else if (err.status === 400) {
        this.showBlockingTip('Не получилось определить координаты. Попробуйте ещё раз.');
      } else {
        this.showBlockingTip('Ошибка сети. Попробуйте ещё раз.');
      }

      // не мешаем повторить
      window.canPlace = true;
    }
  }

  // ---------- events history ----------
  async loadExistingEvents() {
    try {
      const GET_EVENTS_URL =
        'https://ttcwdasslhvkdulqwzte.supabase.co/functions/v1/get-events?hours=24&limit=50';

      const response = await fetch(GET_EVENTS_URL, {
        method: 'GET',
        headers: {
          'authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        mode: 'cors',
        credentials: 'omit',
      });

      if (response.ok) {
        const result = await response.json();
        if (result.ok && result.events) {
          console.log('[EVENTS] loaded', result.events.length, 'events');
          result.events.forEach(ev => this.addExistingPoint(ev.lat, ev.lng, ev.created_at));
        }
      } else {
        console.warn('[EVENTS] load failed', response.status);
      }
    } catch (e) {
      console.error('[EVENTS] failed to load events:', e);
    }
  }

  addExistingPoint(lat, lng, createdAt) {
    const marker = L.circleMarker([lat, lng], {
      pane: 'livePane',
      radius: 6,
      color: '#7FE39A',
      weight: 2,
      fillColor: '#7FE39A',
      fillOpacity: 0.8,
    }).addTo(this.liveLayer);

    let grow = true;
    const id = setInterval(() => {
      const r = marker.getRadius();
      marker.setRadius(grow ? Math.min(8, r + 0.3) : Math.max(6, r - 0.3));
      grow = (r >= 8) ? false : (r <= 6) ? true : grow;
    }, 100);

    const createdTime = new Date(createdAt).getTime();
    const now = Date.now();
    const timeLeft = Math.max(0, 10 * 60 * 1000 - (now - createdTime));

    if (timeLeft > 0) {
      setTimeout(() => {
        clearInterval(id);
        this.liveLayer.removeLayer(marker);
        console.debug('[EVENTS] existing marker auto-removed');
      }, timeLeft);
    } else {
      clearInterval(id);
      this.liveLayer.removeLayer(marker);
    }
  }

  // ---------- UX helpers ----------
  /**
   * Показывает предупреждение на месте фиолетового баннера под картой
   * (розовая подложка, красный текст). Скрывается через 6 сек или по клику.
   */
  showBlockingTip(text) {
    const el = this.ensurePointTip();
    el.textContent = text;

    el.style.display = 'block';
    el.style.background = '#5e0a3b';   // розовая/пурпурная подложка
    el.style.border = '1px solid #ff6fa3';
    el.style.color = '#ffb3c9';        // мягкий красный
    el.style.fontWeight = '600';

    // через 6 сек потухает обратно
    clearTimeout(this._tipTimer);
    this._tipTimer = setTimeout(() => this.hidePointTip(), 6000);
  }

  hidePointTip() {
    const el = this.ensurePointTip();
    el.style.display = 'none';
  }

  ensurePointTip() {
    // если в верстке уже есть готовый баннер — используем его
    let el = document.getElementById('pointTip');
    if (!el) {
      // создаём рядом с картой
      el = document.createElement('div');
      el.id = 'pointTip';
      el.style.marginTop = '10px';
      el.style.padding = '14px 16px';
      el.style.borderRadius = '10px';
      el.style.display = 'none';
      el.style.transition = 'opacity .2s ease';
      // вставим прямо под карту (в тот же контейнер)
      this.container.appendChild(el);
    }
    // клик — скрывает
    el.onclick = () => this.hidePointTip();
    return el;
  }

  startLogging() {
    this.logInterval = setInterval(() => {
      if (this.map && this.currentMode !== 'yin') {
        const center = this.map.getCenter();
        const zoom = this.map.getZoom();
        const tileCount = this.myLayer && this.myLayer._tiles
          ? Object.keys(this.myLayer._tiles).length
          : 0;
        console.info(
          `[Map] stats: zoom=${zoom}, center=[${center.lat.toFixed(4)},${center.lng.toFixed(4)}], tiles=${tileCount}`,
        );
      }
    }, 10000);
  }
}

// ---------- global helpers ----------
window.tilesMapInstance = null;

window.initTilesMap = async function (container) {
  try {
    if (typeof L === 'undefined') await loadLeaflet();
    window.tilesMapInstance = new TilesMap(container);
    await window.tilesMapInstance.init();
    return window.tilesMapInstance;
  } catch (error) {
    console.error('[Map] Failed to initialize:', error);
    throw error;
  }
};

window.destroyTilesMap = function () {
  if (window.tilesMapInstance) {
    window.tilesMapInstance.destroy();
    window.tilesMapInstance = null;
  }
};

// Скрытая админ-функция генерации тайлов
window.generateTiles = async function () {
  if (window.tilesMapInstance) {
    await window.tilesMapInstance.generateTiles();
  } else {
    console.warn('[Tiles] Map not initialized');
  }
};

// Функция для создания тестовых медитационных данных
window.createTestMeditations = function () {
  if (window.tilesMapInstance) {
    window.tilesMapInstance.createTestMeditations();
  } else {
    console.warn('[Map] Map not initialized');
  }
};

// Ленивая загрузка Leaflet
async function loadLeaflet() {
  return new Promise((resolve, reject) => {
    if (typeof L !== 'undefined') return resolve();

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}
