(function () {
  'use strict';
  if (!window.Lampa || window.__XOT_ONLINE_INITIALIZED__) return;
  window.__XOT_ONLINE_INITIALIZED__ = true;

  var BUTTON_CLASS = 'xot-online-button';
  var API_BASE = (function () {
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      if (scripts[i].src && /\/online\.js(?:\?|$)/.test(scripts[i].src)) {
        return new URL(scripts[i].src).origin;
      }
    }
    return location.origin;
  })();

  function notify(message) {
    if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(message);
    else console.info('[XOT]', message);
  }
  function title(card) {
    return (card && (card.title || card.name || card.original_title || card.original_name)) || '';
  }
  function getCard(event) {
    return (event && (event.data || (event.object && event.object.card) || event.movie)) ||
      (Lampa.Activity && Lampa.Activity.active && Lampa.Activity.active().card) || null;
  }
  function openXot(card) {
    if (!card) return notify('ХОТ: інформацію про фільм не знайдено');
    var params = new URLSearchParams();
    if (title(card)) params.set('title', title(card));
    if (card.id) params.set('tmdb_id', String(card.id));
    if (card.release_date || card.first_air_date) {
      params.set('year', String(card.release_date || card.first_air_date).slice(0, 4));
    }
    notify('ХОТ: пошук джерел...');
    fetch(API_BASE + '/api/search?' + params.toString(), {headers: {accept: 'application/json'}})
      .then(function (response) { if (!response.ok) throw new Error('HTTP ' + response.status); return response.json(); })
      .then(function (result) {
        if (!result.results || !result.results.length) {
          notify('ХОТ: джерела ще не підключені або збігів немає');
          return;
        }
        if (!Lampa.Select || !Lampa.Select.show) {
          return notify('ХОТ: поточна версія Lampa не підтримує вибір джерела');
        }
        Lampa.Select.show({
          title: 'ХОТ · Джерела',
          items: result.results.map(function (item) {
            return {title: item.title || item.provider || 'Джерело', subtitle: item.quality || '', item: item};
          }),
          onSelect: function (selected) {
            notify('ХОТ: відтворення буде додано після перевірки джерела');
          },
          onBack: function () { if (Lampa.Controller && Lampa.Controller.toggle) Lampa.Controller.toggle('content'); }
        });
      })
      .catch(function (error) { console.error('[XOT] Search failed', error); notify('ХОТ: API недоступний'); });
  }
  function addButton(event) {
    var card = getCard(event);
    if (!card || typeof window.jQuery !== 'function') return;
    var $ = window.jQuery;
    var container = $('.full-start-new__buttons, .full-start__buttons').first();
    if (!container.length || container.find('.' + BUTTON_CLASS).length) return;
    var button = $('<div class="full-start__button selector ' + BUTTON_CLASS + '" tabindex="0"><span>ХОТ</span></div>');
    button.on('hover:enter click', function () { openXot(card); });
    container.append(button);
  }

  if (Lampa.Listener && Lampa.Listener.follow) {
    Lampa.Listener.follow('full', function (event) {
      if (event && (event.type === 'complite' || event.type === 'complete' || event.type === 'render')) {
        setTimeout(function () { addButton(event); }, 0);
      }
    });
  }
  console.info('[XOT] Initialized');
})();
