# Forme visual refresh

The visual direction is quiet athletic: forest-green feature panels, a restrained pale-lime accent, warm paper backgrounds, and a fine running-track motif. Existing routes, workflows, component APIs, and data requests are preserved. No dependencies or external font requests were added. Display typography uses Bahnschrift/Arial Narrow with system fallbacks; appearance varies with installed fonts.

## Before and after

| Surface | Previous presentation | Applied treatment and purpose |
| --- | --- | --- |
| Client home | Five equally weighted shortcuts beneath a generic action banner | A track-pattern feature panel and contrasting primary action establish a recognizable focus. Larger training/nutrition cards lead the supporting actions. |
| Coach home and roster | Equal white statistic cards and a standard account list | A forest-green active-client anchor, pale pending-client card, larger figures, refined avatars, and row feedback make the overview more deliberate while preserving approvals and navigation. |
| Client progress | Measurement dates and values in a collection | A prominent latest recorded weight and a simple SVG trend give the measurements context. Empty/single-entry states explain how the view develops. No goals, streaks, or success scores are invented. |
| Client setup | Separate blue form palette | Forest-green controls, paper surfaces, and matching type connect the wizard to the rest of the product. |
| Client check-ins | Generic form cards in a two-column workbench | Matching typography and review accents; a single check-in uses a readable form width instead of leaving an unused adjacent column. |
| Coach check-ins | Forms, filters, metric history, and submissions with little visual distinction | Refined collection surfaces, a framed metric table, trend figure treatment, and clearer control spacing. Existing metric selection and review behavior remain intact. |

## Shared details

- Locally drawn SVG navigation symbols replace platform-dependent Unicode navigation glyphs.
- Collection and workspace loading states use lightweight skeleton lines with accessible status text.
- Client-home loading mirrors the dashboard hierarchy.
- Progress and client-roster empty states use contextual guidance.
- Keyboard focus, pointer hover, and reduced-motion preferences are supported.
- The existing client setup wizard remains the coach's client-edit surface. A new consolidated client-detail route was not introduced.

## Visual review

Actual React components were rendered with isolated synthetic data into temporary static HTML, then inspected in the browser with the production stylesheet. Desktop review covered client home, coach home/roster, client progress, empty progress, and both check-in views. The three priority screens were also reviewed in 390px-wide iframe viewports, including mobile navigation. The single-check-in form width was adjusted following that review.

These fixtures validate rendered presentation, not authenticated end-to-end behavior. The fixture generator was removed from application source after review. Temporary pages live under `tmp/ui-review/` (ignored by Git); they contain sample names and example.test addresses, not real client data.

## Validation caveat

Collection search has a pre-existing failure for mixed text/number children: searching for `Workout 21` fails in `collection.test.tsx`. The same test failure was reproduced against the committed collection implementation before this follow-up. Search behavior was left unchanged to preserve the visual-only scope.
