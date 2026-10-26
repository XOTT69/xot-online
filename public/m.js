(function () {
  'use strict';
  if (window.__XOT_ONLINE_INITIALIZED__ || window.__XOT_LOADER_PENDING__) return;
  var scripts = document.getElementsByTagName('script');
  var current = document.currentScript;
  var source = current && /\/m\.js(?:[?#]|$)/.test(current.src || '') ? current.src : '';
  if (!source) {
    for (var i = scripts.length - 1; i >= 0; i--) {
      if (/\/m\.js(?:[?#]|$)/.test(scripts[i].src || '')) { source = scripts[i].src; break; }
    }
  }
  source = source || 'https://xot-online.ai-beta69690.workers.dev/m.js';
  var url = new URL('online.js', source);
  window.__XOT_API_BASE__ = url.origin;
  url.searchParams.set('v', '0.2.0');
  window.__XOT_LOADER_PENDING__ = true;
  var attempts = 0;
  function fail() {
    window.__XOT_LOADER_PENDING__ = false;
    if (window.Lampa && Lampa.Noty) Lampa.Noty.show('ХОТ: не вдалося завантажити плагін. Перевір мережу та перезапусти Lampa.');
    else console.warn('[XOT] Lampa or online.js unavailable');
  }
  function load() {
    if (!window.Lampa || !Lampa.Component || !Lampa.Listener) {
      if (++attempts < 150) return setTimeout(load, 100);
      return fail();
    }
    var script = document.createElement('script');
    var finished = false;
    var timer = setTimeout(function () { script.onerror(); }, 15000);
    script.src = url.toString();
    script.async = true;
    script.onload = function () {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      window.__XOT_LOADER_PENDING__ = false;
      if (!window.__XOT_ONLINE_INITIALIZED__) fail();
    };
    script.onerror = function () {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (script.parentNode) script.parentNode.removeChild(script);
      fail();
    };
    (document.head || document.documentElement).appendChild(script);
  }
  load();
})();
