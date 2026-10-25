(function () {
  'use strict';
  var script = document.currentScript || document.getElementsByTagName('script')[document.getElementsByTagName('script').length - 1];
  var source = script && script.src;
  if (!source || !window.Lampa || !Lampa.Utils || !Lampa.Utils.putScriptAsync) return;
  var url = new URL('online.js', source);
  url.searchParams.set('v', Date.now().toString());
  Lampa.Utils.putScriptAsync([url.toString()], function () {});
})();
