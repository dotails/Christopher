/**
 * Square Online — "location bar does nothing when tapped" fix
 * Target: https://<site>.square.site/s/order?location=<SQUARE_LOCATION_ID>
 *
 * ── What's actually broken ────────────────────────────────────────────────
 * The bar that shows "Pickup at <Store>" is the Vue component
 * `SiteWideFulfillment` (bundle chunk 84977). Its whole container carries a
 * click handler, but the handler self-cancels:
 *
 *   onEditClick() {
 *     this.isEditorContext || (
 *       this.shouldAllowGroupOrderBuyerToChangeFulfillment && (
 *         this.canScheduleCurrentOrder
 *           ? this.openScheduleOrderModal()
 *           : (this.shouldShowFulfillmentToggle && !this.isSquareGoView &&
 *              this.openLocationModalOnOrderOnline())
 *       )
 *     )
 *   }
 *
 * The same `shouldShowFulfillmentToggle` flag also gates the visible "Change"
 * button (`shouldShowChangeFulfillmentButton`). When it is false the button is
 * not rendered, but the text row still renders — so you get a control that
 * reads as tappable and silently swallows the tap.
 *
 * `shouldShowFulfillmentToggle` collapses to false here because:
 *   storeInfo.locations_counts.pickup_or_delivery === 1  -> hasMultiplePickupOrDeliveryLocations = false
 *   storeInfo.fulfillment_support.delivery === false     -> isDeliverySupported             = false
 *   storeInfo.has_shippable_product === false            -> shipping is not a *possible*
 *                                                           fulfillment, so supportedFulfillments
 *                                                           === ['pickup'] and
 *                                                           hasMultipleFulfillmentOptions   = false
 *   and scheduling is unavailable                        -> canScheduleCurrentOrder         = false
 *
 * Note the seller has two locations (`locations_counts.total === 2`), but the
 * second one is shipping-only (`shipping_location_ids`), so Square's own logic
 * decides there is nothing to switch to. This patch restores the control; if
 * the second location should be pickable for pickup, that also has to be
 * enabled on the location in the Square Dashboard.
 *
 * ── What this patch does ─────────────────────────────────────────────────
 *  1. Makes the fulfillment bar a real, keyboard-reachable button and adds a
 *     visible "Change" affordance.
 *  2. On activation, opens Square's OWN location picker, bypassing the dead
 *     guard — first by calling `openLocationModalOnOrderOnline()` on the live
 *     component, then by emitting the `open:select-location-modal` event the
 *     component already listens for.
 *  3. If neither native path is reachable, falls back to a self-contained
 *     picker built from the app's own location store, which switches by
 *     setting the fulfillment store's location and reloading with Square's
 *     documented `?location=<id>` deep link.
 *
 * ── How to use ───────────────────────────────────────────────────────────
 * Open DevTools on the order page, paste this whole file into the Console,
 * press Enter. Re-runnable; call `__sqLocFix.remove()` to undo.
 */
(function () {
  'use strict';

  if (window.__sqLocFix && window.__sqLocFix.remove) window.__sqLocFix.remove();

  var TAG = '[sq-location-fix]';
  var MARK = 'data-sq-location-fix';

  // The container that owns the (dead) click handler, plus its ancestors.
  var BAR_SELECTORS = [
    '.site-wide-fulfillment__inline',
    '.site-wide-fulfillment__card',
    '.site-wide-fulfillment-block',
    '.fulfillment-button'
  ];

  /* ---------------------------------------------------------------- Vue ---
   * Vue 2 exposes the component instance on its root element as `__vue__`,
   * which is how we reach the live component and the Pinia stores.
   */
  function rootVm() {
    var els = document.querySelectorAll('*');
    for (var i = 0; i < els.length; i++) if (els[i].__vue__) return els[i].__vue__.$root;
    return null;
  }

  function walk(vm, fn) {
    if (!vm) return null;
    if (fn(vm)) return vm;
    var kids = vm.$children || [];
    for (var i = 0; i < kids.length; i++) {
      var hit = walk(kids[i], fn);
      if (hit) return hit;
    }
    return null;
  }

  // The SiteWideFulfillment instance: prefer climbing from the bar element.
  function fulfillmentVm() {
    for (var i = 0; i < BAR_SELECTORS.length; i++) {
      var el = document.querySelector(BAR_SELECTORS[i]);
      for (var vm = el && el.__vue__; vm; vm = vm.$parent) {
        if (typeof vm.openLocationModalOnOrderOnline === 'function') return vm;
      }
    }
    return walk(rootVm(), function (vm) {
      return typeof vm.openLocationModalOnOrderOnline === 'function';
    });
  }

  function eventBus() {
    var vm = walk(rootVm(), function (v) {
      return v.siteEventBus && typeof v.siteEventBus.$emit === 'function';
    });
    return vm ? vm.siteEventBus : null;
  }

  /* ------------------------------------------------------------- stores ---
   * Located by shape, not by id, so a bundle rename does not break this.
   */
  function stores() {
    var root = rootVm();
    var pinia = root && (root.$pinia || (root.$options && root.$options.pinia));
    var out = { location: null, fulfillment: null, all: {} };
    if (!pinia || !pinia._s) return out;
    pinia._s.forEach(function (store, id) {
      out.all[id] = store;
      if (store.storeLocations && store.fulfillableLocations) out.location = store;
      if (typeof store.setSelectedLocationId === 'function') out.fulfillment = store;
    });
    return out;
  }

  function locationList() {
    var s = stores();
    var all = (s.location && s.location.storeLocations) || {};
    var fulfillable = (s.location && s.location.fulfillableLocations) || {};
    return Object.keys(all).map(function (id) {
      var l = all[id] || {};
      var addr = (l.address && l.address.data) || l.store_address || {};
      return {
        id: id,
        name: l.display_name || l.nickname || l.name || id,
        address: [addr.address_line_1, addr.city, addr.state].filter(Boolean).join(', '),
        pickup: !!l.pickup_enabled,
        delivery: !!l.delivery_enabled,
        shipping: !!l.is_shipping_location,
        fulfillable: Object.prototype.hasOwnProperty.call(fulfillable, id),
        selected: id === (s.fulfillment && s.fulfillment.selectedLocationId)
      };
    });
  }

  /* -------------------------------------------------------------- open ---- */
  function openPicker() {
    var vm = fulfillmentVm();
    if (vm) {
      try {
        // Square's own picker, called past the guard that never fires.
        vm.openLocationModalOnOrderOnline();
        return 'native:component';
      } catch (e) {
        console.warn(TAG, 'component call failed, trying event bus', e);
      }
    }
    var bus = eventBus();
    if (bus) {
      try {
        // The component subscribes to this in mounted().
        bus.$emit('open:select-location-modal');
        return 'native:eventBus';
      } catch (e) {
        console.warn(TAG, 'event bus failed, using fallback picker', e);
      }
    }
    fallbackPicker();
    return 'fallback';
  }

  function switchTo(id) {
    var s = stores();
    try {
      if (s.fulfillment) s.fulfillment.setSelectedLocationId({ locationId: id });
    } catch (e) {
      console.warn(TAG, 'setSelectedLocationId failed; relying on URL', e);
    }
    // ?location=<id> is Square's own deep link (query key `location`), so this
    // path works even when the store rejects the assignment.
    var url = new URL(window.location.href);
    url.searchParams.set('location', id);
    window.location.assign(url.toString());
  }

  /* --------------------------------------------------- fallback picker ---- */
  function fallbackPicker() {
    var existing = document.getElementById('sq-location-fix-picker');
    if (existing) existing.remove();

    var list = locationList();
    var wrap = document.createElement('div');
    wrap.id = 'sq-location-fix-picker';
    wrap.setAttribute(MARK, '');
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', 'Choose a location');
    wrap.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:2147483647',
      'background:rgba(0,0,0,.45)', 'display:flex',
      'align-items:flex-end', 'justify-content:center'
    ].join(';');

    var card = document.createElement('div');
    card.style.cssText = [
      'background:#fff', 'color:#111', 'width:min(480px,100%)',
      'max-height:80vh', 'overflow:auto', 'border-radius:16px 16px 0 0',
      'padding:20px', 'font:14px/1.4 system-ui,-apple-system,sans-serif',
      'box-shadow:0 -8px 32px rgba(0,0,0,.25)'
    ].join(';');

    var h = document.createElement('h2');
    h.textContent = 'Choose a location';
    h.style.cssText = 'margin:0 0 12px;font-size:18px;';
    card.appendChild(h);

    if (!list.length) {
      var empty = document.createElement('p');
      empty.textContent = 'No locations found in the page store.';
      card.appendChild(empty);
    }

    list.forEach(function (loc) {
      var b = document.createElement('button');
      b.type = 'button';
      b.style.cssText = [
        'display:block', 'width:100%', 'text-align:left', 'cursor:pointer',
        'margin:0 0 8px', 'padding:12px 14px', 'border-radius:12px',
        'border:1px solid ' + (loc.selected ? '#111' : '#ddd'),
        'background:' + (loc.selected ? '#f5f5f5' : '#fff'), 'font:inherit'
      ].join(';');
      var methods = [
        loc.pickup ? 'pickup' : null,
        loc.delivery ? 'delivery' : null,
        loc.shipping ? 'shipping' : null
      ].filter(Boolean).join(' · ') || 'no fulfillment enabled';
      b.innerHTML =
        '<strong>' + esc(loc.name) + (loc.selected ? ' (current)' : '') + '</strong>' +
        (loc.address ? '<br><span style="color:#555">' + esc(loc.address) + '</span>' : '') +
        '<br><span style="color:#777;font-size:12px">' + esc(methods) + ' — ' + esc(loc.id) + '</span>';
      b.addEventListener('click', function () { switchTo(loc.id); });
      card.appendChild(b);
    });

    var close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Close';
    close.style.cssText = 'margin-top:8px;padding:10px 14px;border-radius:999px;border:0;background:#111;color:#fff;font:inherit;cursor:pointer;';
    close.addEventListener('click', function () { wrap.remove(); });
    card.appendChild(close);

    wrap.appendChild(card);
    wrap.addEventListener('click', function (e) { if (e.target === wrap) wrap.remove(); });
    document.body.appendChild(wrap);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ------------------------------------------------------------ patching -- */
  var handler = function (e) {
    e.preventDefault();
    e.stopPropagation();
    console.log(TAG, 'opened picker via', openPicker());
  };

  function barElement() {
    for (var i = 0; i < BAR_SELECTORS.length; i++) {
      var el = document.querySelector(BAR_SELECTORS[i]);
      if (el) return el;
    }
    return null;
  }

  function patch() {
    var bar = barElement();
    if (!bar || bar.hasAttribute(MARK)) return !!bar;

    bar.setAttribute(MARK, '');
    bar.style.cursor = 'pointer';
    bar.setAttribute('role', 'button');
    bar.setAttribute('tabindex', '0');
    bar.setAttribute('aria-haspopup', 'dialog');

    // Capture phase: the dead native handler never gets to swallow the tap.
    bar.addEventListener('click', handler, true);
    bar.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') handler(e);
    }, true);

    // Restore the "Change" affordance the component refuses to render.
    if (!bar.querySelector('.sq-location-fix-change')) {
      var chip = document.createElement('span');
      chip.className = 'sq-location-fix-change';
      chip.setAttribute(MARK, '');
      chip.textContent = 'Change';
      chip.style.cssText = [
        'margin-left:auto', 'padding:4px 12px', 'border-radius:999px',
        'border:1px solid currentColor', 'font-size:12px', 'font-weight:600',
        'white-space:nowrap', 'align-self:center', 'cursor:pointer'
      ].join(';');
      var host = bar.querySelector('.site-wide-fulfillment__text') || bar;
      if (host === bar) bar.appendChild(chip);
      else host.parentNode.appendChild(chip);
      if (getComputedStyle(bar).display.indexOf('flex') === -1) bar.style.display = 'flex';
      bar.style.alignItems = 'center';
      bar.style.gap = bar.style.gap || '12px';
    }
    return true;
  }

  // The page is a SPA; re-apply after re-renders.
  var observer = new MutationObserver(function () { patch(); });
  observer.observe(document.body, { childList: true, subtree: true });

  var found = patch();

  window.__sqLocFix = {
    open: openPicker,
    locations: locationList,
    switchTo: switchTo,
    stores: stores,
    component: fulfillmentVm,
    remove: function () {
      observer.disconnect();
      document.querySelectorAll('[' + MARK + ']').forEach(function (el) {
        if (el.classList.contains('sq-location-fix-change') || el.id === 'sq-location-fix-picker') {
          el.remove();
          return;
        }
        el.removeEventListener('click', handler, true);
        el.removeAttribute(MARK);
        el.removeAttribute('role');
        el.removeAttribute('tabindex');
        el.removeAttribute('aria-haspopup');
        el.style.cursor = '';
      });
      delete window.__sqLocFix;
    }
  };

  console.log(
    TAG,
    found ? 'fulfillment bar patched — tap it, or call __sqLocFix.open()'
          : 'fulfillment bar not on screen yet; watching for it. __sqLocFix.open() works now.'
  );
  console.table(locationList());
})();
