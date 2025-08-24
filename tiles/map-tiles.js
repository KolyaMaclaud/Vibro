// Tiles Map Module
// Интеграция со старой навигацией (3 иконки)

// === Supabase Edge Function (URL постоянный) ===
const ADD_EVENT_URL = 'https://ttcwdasslhvkdulqwzte.supabase.co/functions/v1/add-event';
// ⬇️ Используй свой ANON KEY (как сейчас в проекте)
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0Y3dkYXNzbGh2a2R1bHF3enRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1NDU0MzQsImV4cCI6MjA3MTEyMTQzNH0.olNpZvqAU5XQbP8Owy1fCl0oCZaVIPXUH89PP8kwNPk';

// ─────────────────────────────────────────────────────────────────────────────
// Небольшие стили для баннера ошибок/подсказок (вставим один раз)
(function injectPointTipStyles() {
  if (document.getElementById('point-tip-styles')) return;
  const css = `
    .point-tip {
      margin-top: 12px;
      border-radius: 10px;
      padding: 14px 16px;
      line-height: 1.35;
      font-size: 14px;
      border: 1px solid transparent;
      transition: all .2s ease;
    }
    .point-tip--info {
      background: rgba(180, 0, 255, 0.15);
      border-color: rgba(180, 0, 255, 0.35);
      color: #f4e6ff;
    }
    .point-tip--error {
      background: rgba(255, 41, 112, 0.18);
      border-color: rgba(255, 41, 112, 0.45);
      color: #ffb3c6;
      font-weight: 600;
    }
  `;
  const style = document.createElement('style');
  style.id = 'point-tip-styles';
  style.textContent = css;
  document.head.appendChild(style);
})();

// Найдём/создадим контейнер подсказки под картой.
// Это то место, где у тебя ранее был текст «Удерживай палец/мышь ~0.5 сек…».
function ensurePointTipContainer() {
  let tip = document.getElementById('pointTip');
  if (!tip) {
    // Ищем секцию под картой (там, где начинается блок приложения).
    // Если нет явного места, вставим в начало основного контента.
    const host =
      document.querySelector('#mapSection') ||
      document.querySelector('#mapWrap') ||
      document.querySelector('.app') ||
      document.body;

    tip = document.createElement('div');
    tip.id = 'pointTip';
    tip.className = 'point-tip point-tip--info';
    host.insertBefore(tip, host.firstChild);
  }
  return tip;
}

function setPointTip(text, isError = false) {
  const tip = ensurePointTipContainer();
  tip.classList.toggle('point-tip--info', !isError);
  tip.classList.toggle('point-tip--error', !!isError);
  tip.innerHTML = text;
}
function showDefaultPointTip() {
  setPointTip('Удерживай палец/мышь ~0.5 сек на карте, чтобы поставить точку (24 часа).', false);
}
window.showPointTip = showDefaultPointTip;
window.hidePointTip = () => setPointTip('', false);

// Красивые тексты ошибок
function showRateLimitBanner(secondsLeft) {
  if (typeof secondsLeft === 'number' && secondsLeft > 0) {
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    const human = m > 0 ? `${m} мин ${s.toString().padStart(2, '0')} сек` : `${s} сек`;
    setPointTip(
      `Вы не могли так быстро закончить ещё одну медитацию.<br>
      Поставить точку на карте можно минимум через <b>${human}</b>.`,
      true
    );
  } else {
    setPointTip(
      `Вы не могли так быстро закончить ещё одну медитацию.<br>
      Поставить точку на карте можно минимум через <b>5 минут</b>.`,
      true
    );
  }
}
function showNetworkErrorBanner() {
  setPointTip(
    `Не удалось связаться с сервером. Проверьте интернет или повторите чуть позже.`,
    true
  );
}
function showGenericErrorBanner() {
  setPointTip(
    `Произошла ошибка. Попробуйте ещё раз через минуту.`,
    true
  );
}

// ─────────────────────────────────────────────────────────────────────────────

class TilesMap {
  constructor(container) {
    this.container = container;
    this.map = null;
    this.myLayer = null;
    this.baseLayers = {};
    this.currentBaseLayer = null;
    this.logInterval = null;
    this.isInitialized = false;
    this.currentMode = 'dark'; // по умолчанию тёмная карта

    // Endpoints
    this.FN_GET = 'https://ttcwdasslhvkdulqwzte.supabase.co/functions/v1/get-tiles';
    this.FN_GEN = 'https://ttcwdasslhvkdulqwzte.supabase.co/functions/v1/generate-tiles-hourly';

    this.MAX_BOUNDS = null;
  }

  async init() {
    if (this.isInitialized) return;

    try {
      this.MAX_BOUNDS = L.latLngBounds(L.latLng(-58, -180), L.latLng(75, 180));
      this.createMapContainer();

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
        center: [20, 0]
      });

      this.createBaseLayers();

      const savedMode = localStorage.getItem('mapBase') || 'dark';
      this.setMode(savedMode);

      if (savedMode === 'yin') {
        setTimeout(() => {
          if (typeof syncCanvasSize === 'function') syncCanvasSize();
          if (typeof drawYinYang === 'function') drawYinYang();
          if (typeof createTestMeditations === 'function') createTestMeditations();
        }, 200);
      }

      this.createMyDataLayer();
      this.createLivePane();
      this.setupLongPressHandlers();
      this.startLogging();

      // показать стандартную подсказку
      showDefaultPointTip();

      this.isInitialized = true;
      console.info(`[Map] initialized: base=${this.currentMode}`);
    } catch (error) {
      console.error('[TILES] Failed to initialize map:', error);
      throw error;
    }
  }

  createMapContainer() {
    this.mapContainer = document.createElement('div');
    this.mapContainer.className = 'tiles-map-container';

    this.mapElement = document.createElement('div');
    this.mapElement.className = 'tiles-map';

    this.mapContainer.appendChild(this.mapElement);
    this.container.appendChild(this.mapContainer);
  }

  createBaseLayers() {
    this.baseLayers = {
      cartoLight: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        noWrap: true,
        bounds: this.MAX_BOUNDS,
        updateWhenIdle: true
      }),
      cartoDark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        noWrap: true,
        bounds: this.MAX_BOUNDS,
        updateWhenIdle: true
      }),
      osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        subdomains: 'abc',
        noWrap: true,
        bounds: this.MAX_BOUNDS,
        updateWhenIdle: true
      })
    };
  }

  createMyDataLayer() {
    this.myLayer = L.tileLayer(this.FN_GET + '?z={z}&x={x}&y={y}', {
      noWrap: true,
      bounds: this.MAX_BOUNDS,
      tileSize: 128,
      updateWhenIdle: true,
      crossOrigin: true
    });

    this.myLayer.addTo(this.map);
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
      fillOpacity: 0.8
    });

    this.liveLayer.addLayer(marker);

    // «дыхание» быстрое
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
        marker.setStyle({
          color: '#7FE39A',
          fillColor: '#7FE39A',
          fillOpacity: 0.8
        });
        // медленное «дыхание»
        let grow = true;
        const slowId = setInterval(() => {
          const r = marker.getRadius();
          marker.setRadius(grow ? Math.min(8, r + 0.3) : Math.max(6, r - 0.3));
          grow = (r >= 8) ? false : (r <= 6) ? true : grow;
        }, 100);
        return () => { clearInterval(slowId); this.liveLayer.removeLayer(marker); };
      }
    };
  }

  // Отправка точки на сервер
  async postPoint(lat, lng, clientId, level = 1) {
    const payload = { lat, lng, client_id: clientId, level };

    const resp = await fetch(ADD_EVENT_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(payload),
    });

    // Уловим 429 с полезным JSON
    if (!resp.ok) {
      let bodyText = '';
      try { bodyText = await resp.text(); } catch {}
      let parsed = null;
      try { parsed = JSON.parse(bodyText); } catch {}

      if (resp.status === 429) {
        // пытаемся вытащить секунды из hint: "wait 123s before..."
        let seconds = null;
        if (parsed && typeof parsed.hint === 'string') {
          const m = parsed.hint.match(/wait\s+(\d+)s/i);
          if (m) seconds = parseInt(m[1], 10);
          // иногда присылаем уже готовую фразу "wait 5 minutes ..."
          const mMin = parsed.hint.match(/wait\s+(\d+)\s*minutes?/i);
          if (!seconds && mMin) seconds = parseInt(mMin[1], 10) * 60;
        }
        showRateLimitBanner(seconds);
      } else if (resp.type === 'opaque' || bodyText === '' || /ERR_FAILED/i.test(bodyText)) {
        showNetworkErrorBanner();
      } else {
        showGenericErrorBanner();
      }

      throw new Error(`Server ${resp.status}: ${bodyText || 'error'}`);
    }

    return await resp.json();
  }

  // Вызов при длинном тапе
  async placePoint(lat, lng, optimisticMarker) {
    try {
      const clientId = (typeof window.getClientId === 'function')
        ? window.getClientId()
        : 'unknown';

      const res = await this.postPoint(lat, lng, clientId, 1);
      console.log('[POINT] success', res);

      const cleanup = optimisticMarker.makePermanent();
      if (window.showToast) window.showToast('Точка сохранена на карте!');
      // Вернём стандартную подсказку
      showDefaultPointTip();

      // автоснятие через 10 минут
      setTimeout(() => {
        cleanup();
        console.debug('[POINT] marker auto-removed after 10 minutes');
      }, 10 * 60 * 1000);
    } catch (err) {
      console.warn('[POINT] error', err);
      optimisticMarker.cleanup();
      // возможность повторить
      window.canPlace = true;
    }
  }

  setMode(mode) {
    if (this.currentMode === mode) return;

    if (this.currentBaseLayer) {
      this.map.removeLayer(this.currentBaseLayer);
    }

    this.currentMode = mode;

    const mapWrap = document.getElementById('mapWrap') || document.getElementById('mapSection');

    if (mode === 'yin') {
      this.mapContainer.style.display = 'none';
      this.currentBaseLayer = null;
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
      this.mapContainer.style.display = 'block';
      if (mapWrap) mapWrap.classList.remove('map--yin');

      const vmap = document.getElementById('vmap');
      const yinCanvas = document.getElementById('yinCanvas');
      if (vmap) vmap.style.display = 'none';
      if (yinCanvas) yinCanvas.style.display = 'none';
      if (typeof stopYinAnimation === 'function') stopYinAnimation();

      this.currentBaseLayer = (mode === 'light') ? this.baseLayers.cartoLight : this.baseLayers.cartoDark;
      if (this.currentBaseLayer) this.currentBaseLayer.addTo(this.map);
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

  // Загрузка существующих событий (последние 24ч)
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
        credentials: 'omit'
      });

      if (response.ok) {
        const result = await response.json();
        if (result.ok && result.events) {
          console.log('[EVENTS] loaded', result.events.length, 'events');
          result.events.forEach(ev => {
            this.addExistingPoint(ev.lat, ev.lng, ev.created_at);
          });
        }
      } else {
        console.warn('[EVENTS] load failed', response.status);
      }
    } catch (e) {
      console.error('[EVENTS] failed to load events:', e);
    }
  }

  // Зелёная «постоянная» точка
  addExistingPoint(lat, lng, createdAt) {
    const marker = L.circleMarker([lat, lng], {
      pane: 'livePane',
      radius: 6,
      color: '#7FE39A',
      weight: 2,
      fillColor: '#7FE39A',
      fillOpacity: 0.8
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

  createTestMeditations() {
    if (typeof window.createTestMeditations === 'function') {
      window.createTestMeditations();
      console.info('[Map] Test meditations created');
    } else {
      console.warn('[Map] createTestMeditations function not found');
    }
  }

  startLogging() {
    this.logInterval = setInterval(() => {
      if (this.map && this.currentMode !== 'yin') {
        const center = this.map.getCenter();
        const zoom = this.map.getZoom();
        const tileCount = this.myLayer && this.myLayer._tiles
          ? Object.keys(this.myLayer._tiles).length
          : 0;
        console.info(`[Map] stats: zoom=${zoom}, center=[${center.lat.toFixed(4)},${center.lng.toFixed(4)}], tiles=${tileCount}`);
      }
    }, 10000);
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
}

// Глобальная переменная для экземпляра карты
window.tilesMapInstance = null;

// Инициализация карты
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

// Уничтожение карты
window.destroyTilesMap = function () {
  if (window.tilesMapInstance) {
    window.tilesMapInstance.destroy();
    window.tilesMapInstance = null;
  }
};

// Скрытая админ-функция генерирования тайлов
window.generateTiles = async function () {
  if (window.tilesMapInstance) {
    await window.tilesMapInstance.generateTiles();
  } else {
    console.warn('[Tiles] Map not initialized');
  }
};

// Функция для создания тестовых медитаций
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
