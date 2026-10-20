# Workspace themes and session status

The library and settings now display the same Supabase session used by the workspace profile controls. Configured projects no longer always show the signed-out prompt. Existing sessions restore on refresh; sign-in, token refresh and sign-out update the message. Checking, local-only and session-read failure states have separate messages. A delayed session read cannot overwrite a newer auth event, and subscriptions are cleaned up on unmount.

Open **Workspace settings → Appearance & canvas** to select a palette or click its preview. The navigation rail theme button cycles through all ten:

- Deep teal and Daylight (the original dark/light identifiers remain compatible).
- Monochrome black and Monochrome white.
- Midnight blue, Forest green, Amber terminal and Violet dusk.
- Rose paper and Warm sand.

New palettes use tonal surfaces and one accent hue; monochrome palettes keep all semantic colors grayscale. Canvas objects retain shape and line-pattern distinctions. Dialogs, tooltips, Plotly charts, and PNG screenshot headers follow the active palette. Themes save with project JSON and local/cloud configurations. The printable report keeps its own paper layout; its embedded network diagram uses the captured theme.

No new database migration, dependency, or Supabase credential is needed. A signed-in status reflects Auth state; it does not confirm a successful cloud database write.

## Verification

- 106 frontend/shared unit tests pass, covering session restoration/events, stale-read ordering, unmount cleanup, all ten theme serialization round-trips, unchanged simulation results, monochrome colors, and text/button contrast for new palettes.
- Strict TypeScript and production build checked in the Desktop checkout.
- Browser acceptance tests updated for the renamed theme-cycle control and all ten palettes, dialog propagation, and reload persistence. These new browser tests were not executed: access to the user's in-app browser was blocked earlier, and that restriction was not bypassed. Live signed-in rendering, chart appearance and PNG colors need a manual check.

## Manual acceptance

1. Refresh while signed in. Open the library and settings; confirm the email appears instead of a sign-in prompt. Sign out, then sign in and confirm both messages update without reloading.
2. Choose each theme in settings. Confirm panels, grid, graph, tooltips and dialog match; select Monochrome black/white and check that the workspace has no colored accents.
3. Save and reload, then export/import setup JSON. Confirm the selected palette persists. Download a PNG and confirm its header matches the network colors.
