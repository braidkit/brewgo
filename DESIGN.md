# BrewGo design system

## Scene and direction

A commuter opens the menu in daylight on a phone, with one hand free and only a few minutes before leaving. Use a light, high-contrast interface that makes products, prices, and pickup location easy to scan.

Restrained product UI with one deep teal accent. White is the page background; teal carries the brand. Photography supplies the coffee's natural warmth.

## Tokens

The source of truth is `src/index.css`. All brand roles use OKLCH.

| Role | Value | Use |
| --- | --- | --- |
| Background | `oklch(1 0 0)` | Page and dialogs |
| Ink | `oklch(0.23 0.023 184)` | Headings and body |
| Muted ink | `oklch(0.46 0.015 184)` | Supporting text |
| Primary | `oklch(0.36 0.065 184)` | Actions and selection |
| Secondary | `oklch(0.96 0.012 184)` | Store summaries and quiet surfaces |
| Hero | `oklch(0.29 0.048 184)` | Featured photograph and headline |
| Border | `oklch(0.90 0.008 184)` | Structure and form controls |

The primary hue follows Impeccable's palette seed (188 degrees). Body text against white is 16.77:1, muted text against white is 7.07:1, and white on primary is 10.50:1. Ratios calculated from the source OKLCH colors.

## Typography

One sans family: Avenir Next, Avenir, Segoe UI, then the platform sans. Normal sentence case. Fixed heading sizes, no fluid product typography. Hero display ranges from 32 to 52 px at structural breakpoints. Headings use a maximum tracking of -0.04 em and wrap long user-provided names.

## Components

Actual shadcn/ui new-york components, installed through its CLI: Button, Dialog, Sheet, Input, Label, Select, Badge, Separator, and Skeleton. Radix supplies focus trapping and accessible primitives; dialog and sheet wrappers restore focus to programmatic launchers. Lucide supplies the icons. Component imports use the local `cn` utility.

Menu tiles use photographs, plain text, and direct controls. Product images are merchandise, not decorative feature cards. Rounded corners stay at 6–12 px for surfaces, with pill buttons. No gradients, glass panels, decorative shadows, repeated section eyebrows, metric blocks, or entrance choreography.

## Responsive layout

- Desktop: category rail, product grid, sticky order bag.
- Tablet: category rail and three-column products; bag moves into a sheet.
- Phone: scrollable category choices, two-column products, stacked hero, and persistent bag action when populated.
- Smallest phones: compact header with the menu reachable through the hero action and skip link.

## Interaction and motion

Feedback transitions take 160–250 ms. Image hover subtly enlarges the photograph. Notifications announce additions and store changes. Reduced-motion preferences remove animation. Errors keep the order intact and allow retry. Favorite choices, bag, and store persist in browser storage when available.

## Content rules

US dollar prices, fictional stores, sample hours and nutrition. Payment simulation is explained before confirmation. Never request card details or imply a real order was sent. Customer accounts are explicitly local sample profiles with no email/password collection.
