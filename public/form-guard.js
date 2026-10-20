/* form-guard.js
   Shared bot protection for the sign-up forms.
   - Adds a hidden honeypot field that real visitors never see or fill.
   - Fetches a signed timing token from the server.
   - Shows a Cloudflare Turnstile check when the server has it switched on.
   Pages call FormGuard.fields() and merge the result into their request body. */
(function () {
  var cfg = { token: '', turnstileSiteKey: '' };
  var widgetId = null;
  var honeypot = null;

  var ready = fetch('/api/form-config', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (c) { cfg = c || cfg; })
    .catch(function () {});

  function addHoneypot() {
    var form = document.querySelector('form');
    if (!form) return;
    var wrap = document.createElement('div');
    wrap.setAttribute('aria-hidden', 'true');
    wrap.style.cssText = 'position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;';
    honeypot = document.createElement('input');
    honeypot.type = 'text';
    honeypot.name = 'website';
    honeypot.tabIndex = -1;
    honeypot.autocomplete = 'off';
    wrap.appendChild(honeypot);
    form.appendChild(wrap);
  }

  function addTurnstile() {
    if (!cfg.turnstileSiteKey) return;
    var form = document.querySelector('form');
    if (!form) return;
    var holder = document.createElement('div');
    holder.style.cssText = 'margin:14px 0;';
    var submit = form.querySelector('button[type="submit"]');
    if (submit) form.insertBefore(holder, submit); else form.appendChild(holder);

    var s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = function () {
      if (window.turnstile) {
        widgetId = window.turnstile.render(holder, { sitekey: cfg.turnstileSiteKey, theme: 'auto' });
      }
    };
    document.head.appendChild(s);
  }

  function init() {
    addHoneypot();
    ready.then(addTurnstile);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.FormGuard = {
    // Resolves to the extra fields every signup request must carry.
    fields: function () {
      return ready.then(function () {
        var cf = '';
        if (widgetId !== null && window.turnstile) cf = window.turnstile.getResponse(widgetId) || '';
        return { website: honeypot ? honeypot.value : '', gt: cfg.token || '', cf: cf };
      });
    },
    // Call after a failed attempt so a fresh token and challenge are used on retry.
    reset: function () {
      if (widgetId !== null && window.turnstile) window.turnstile.reset(widgetId);
      return fetch('/api/form-config', { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (c) { cfg.token = c.token || cfg.token; })
        .catch(function () {});
    }
  };
})();
