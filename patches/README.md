# Square Online order page — location bar is inert

Page: `https://fruitypatootiestw.square.site/s/order?location=LHQVYSXBQRTHG`

## Symptom

The "Pickup at …" bar at the top of the order page reads as tappable, but
tapping it does nothing — no picker, no feedback.

## Diagnosis

The page is a Vue 2 SPA (Square Online / Weebly `ecom-website` bundle); the
served HTML is only a shell, so the evidence below comes from the shipped
bundle and the page's own bootstrap state.

The bar is the `SiteWideFulfillment` component (chunk `84977`). Its container
does carry a click handler, but the handler cancels itself:

```js
onEditClick() {
  this.isEditorContext || (
    this.shouldAllowGroupOrderBuyerToChangeFulfillment && (
      this.canScheduleCurrentOrder
        ? this.openScheduleOrderModal()
        : (this.shouldShowFulfillmentToggle && !this.isSquareGoView &&
           this.openLocationModalOnOrderOnline())
    )
  )
}
```

`shouldShowFulfillmentToggle` also gates the visible "Change" button
(`shouldShowChangeFulfillmentButton`). When it is false the button is not
rendered — but the text row still is, which is why the control looks
interactive and silently swallows taps.

From `window.__BOOTSTRAP_STATE__.storeInfo` on the live page:

| field | value | consequence |
| --- | --- | --- |
| `locations_counts.pickup_or_delivery` | `1` | `hasMultiplePickupOrDeliveryLocations` → false |
| `fulfillment_support.delivery` | `false` | `isDeliverySupported` → false |
| `has_shippable_product` | `false` | shipping is not a *possible* fulfillment, so `supportedFulfillments === ['pickup']` and `hasMultipleFulfillmentOptions` → false |
| scheduling unavailable | — | `canScheduleCurrentOrder` → false |

Every disjunct of `canChangeFulfillmentOption` is false, so
`shouldShowFulfillmentToggle` is false and the tap is a no-op.

Worth flagging: `locations_counts.total` is `2`. The second location
(`NQH8DQA34HE6F`) is the shipping location, and no product is marked
shippable, so Square's logic concludes there is nothing to switch to. If the
second storefront is meant to be selectable for pickup, enabling pickup on it
in the Square Dashboard is the upstream fix — a client-side patch cannot
create a fulfillment option the backend does not offer.

## The patch

`square-online-location-selector-fix.js` — paste into the DevTools Console on
the order page.

1. Makes the bar a real, keyboard-reachable button (`role`, `tabindex`,
   cursor) and restores a visible "Change" chip.
2. On activation, opens **Square's own** location picker past the dead guard:
   first `openLocationModalOnOrderOnline()` on the live component, then the
   `open:select-location-modal` event the component already subscribes to.
3. If neither native path is reachable, renders a self-contained picker built
   from the app's location store and switches via the fulfillment store plus
   Square's documented `?location=<id>` deep link.

Listeners are registered in the capture phase so the dead native handler never
gets to swallow the tap. A `MutationObserver` re-applies the patch across SPA
re-renders. Re-running is safe; `__sqLocFix.remove()` reverts everything.

Helpers exposed on `window.__sqLocFix`: `open()`, `locations()`,
`switchTo(id)`, `stores()`, `component()`, `remove()`.

## Verification

Tested in headless Chromium against a mock reproducing the component tree,
the Pinia stores, and the self-cancelling native handler:

- bar gains `role=button`, `tabindex=0`, pointer cursor, "Change" chip
- both locations discovered from the store, with fulfillment flags
- click and <kbd>Enter</kbd> both reach the native picker
- with both native paths broken, the fallback picker renders
- choosing the second location calls `setSelectedLocationId` and navigates to
  `?location=NQH8DQA34HE6F`
- re-running adds no duplicate chip; `remove()` restores original attributes

The live page itself could not be rendered from this environment — the
sandbox's egress proxy refuses browser traffic — so the DOM claims above come
from the shipped component source rather than a live render.
