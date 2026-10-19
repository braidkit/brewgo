# BrewGo UI audit

Reviewed with Impeccable on October 19, 2026. Scope: menu, categories, favorites, store picker, product customization, bag, checkout, confirmation, account, and order history.

## Anti-pattern verdict

**Pass for the reviewed scope.** The UI uses a familiar retail ordering structure with original BrewGo branding and actual shadcn components. It avoids gradient text, glass panels, oversized rounded sections, decorative shadows, fake metrics, repeated section eyebrows, icon feature-card grids, and ornamental motion. Product tiles contain actual merchandise and ordering controls. Generated photographs are used as product imagery; no UI text or controls are rasterized.

The bundled Impeccable detector returned `[]` for `src`. This means no source patterns matched its rules; it does not replace visual review.

## Health score

| Dimension | Score | Evidence |
| --- | --- | --- |
| Accessibility | 3/4 | Labels, semantic headings, named icon controls, contrast checks, focus return, and keyboard-driven dialogs checked. No full assistive-technology audit. |
| Performance | 3/4 | Local optimized photographs, lazy menu images, reserved image dimensions, about 124 KB gzipped application JavaScript. A single bundle remains. |
| Responsive design | 4/4 | Checked at 320, 390, 768, and 1440 px. No page-level horizontal overflow; phone and tablet ordering flows work. |
| Theming | 3/4 | Consistent OKLCH roles, focus, selection, errors, disabled controls, and overlays. A single daylight theme is implemented. |
| Anti-patterns | 4/4 | No flagged detector patterns or prominent visual tells from Impeccable's banned list. |
| **Total** | **17/20** | **Good; no open blocking findings in the checked scope.** |

## Findings addressed during implementation

- **P1, accessibility:** the icon-only account button lost its visible name at narrower widths. Added a persistent accessible name, verified in the browser accessibility tree.
- **P1, accessibility:** programmatically opened dialogs initially returned focus to the page body. Dialog and Sheet wrappers now capture and restore their launcher, with a menu fallback when the launcher disappears. Verified after adding a product.
- **P1, responsive design:** at 320 px, header actions wrapped beyond the header. Added a compact breakpoint and removed the redundant menu nav item at this width. Verified actions remain inside the header and the page does not overflow.
- **P2, content:** source photos for iced matcha, americano, tea, and the croissant sandwich did not accurately show the listed items. Replaced them and checked the images visually.
- **P2, clarity:** replaced vague checkout text with a direct review heading and explicit simulated-payment language. USD, customization costs, sample tax, and fictional cafes are clear.
- **P2, interaction:** notifications remained visible while a new modal opened. Opening a modal now dismisses the prior notification.

## Contrast evidence

Computed from the actual source OKLCH tokens using linear sRGB luminance:

| Foreground/background | Ratio |
| --- | --- |
| Body ink / white | 16.77:1 |
| Muted ink / white | 7.07:1 |
| Muted ink / secondary | 6.32:1 |
| White / primary | 10.50:1 |
| White / hero | 13.83:1 |
| Soft hero text / hero | 8.95:1 |
| Error ink / white | 7.19:1 |

## Browser checks

- Search, empty search recovery, category filters, save favorites, and favorites filtering.
- Cafe search for Seattle, selection of Capitol Hill, and unavailable cafe state.
- Medium iced oat latte, almond milk, extra shot, and quantity two: $15.10.
- Add a croissant: $18.55 subtotal, $1.53 sample tax, $20.08 total.
- Confirm simulated payment and inspect the pickup number, cafe, quantity, and total.
- Open saved guest history, create a sample profile, and confirm history remains visible.
- Reload and verify bag, chosen cafe, favorites, and customer name persist.
- Phone product customization, bag sheet, and checkout with the saved pickup name.
- Loaded images and accessible button names; keyboard focus return after modal close.
- Built app served directly by FastAPI: an iced matcha order at Flatiron confirmed with a $5.45 subtotal, $0.45 tax, $5.90 total, and a pickup number.

## Remaining limits

The audit does not certify WCAG conformance. It does not include a full screen-reader session, real-device latency measurements, a Lighthouse run, or exhaustive browser compatibility testing. The single light theme is intentional for this app. Secondary product metadata is compact; user testing at real display sizes would guide any density changes.

No further design change is required to show the requested ordering flow. Before a production release, perform an assistive-technology audit and a network-throttled performance check on actual mobile devices.
