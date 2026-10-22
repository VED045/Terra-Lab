# Network Studio reference layout

The Network Studio now uses the supplied reference's workbench arrangement, adapted to TerraLab's existing themes and simulator capabilities.

- Compact top navigation, project switcher, primary baseline action, save and account/theme tools.
- A separate, horizontally scrollable workspace toolbar retains the existing laboratory, evidence, writing, export, undo/redo and panel controls.
- Grouped network objects with placement tools, a larger central canvas, a vertical tool rail and a bordered legend.
- A right properties inspector with keyboard-operable native disclosure sections. On tablets and phones the inspector opens over the canvas.
- A full-width simulation dock with real playback, timeline, measurements, logs, scientific metrics and chart data. It can still collapse independently.
- All ten existing palettes use their existing design tokens, including light and monochrome themes. Mobile retains navigation, baseline/save, theme/account and a toolbar that scrolls within the page width.

The same 2D/3D renderers, live project store, numerical methods, coordinate units, save semantics and exports remain in use. The reference's illustrative TDoA readings and trend metrics are not substituted for TerraLab's actual outputs. No dependency, database, provider or deployment configuration change is required.

## Validation

- 277 unit tests passed; two existing opt-in tests skipped.
- All 54 core browser scenarios passed across the full run and focused follow-up runs. These cover actual Next-to-Python solves, editor interactions, playback, exports, save/reload, all palettes, mobile/tablet and 3D behavior. New checks verify the full-width dock and panel geometry across every palette, disclosure keyboard behavior and group placement.
- All 14 AI/research browser scenarios passed across the suite and focused follow-up. The project-preserving canvas/AI round trip now selects the navigation link rather than the former duplicate button.
- TypeScript check and isolated production build passed. A fresh production-build AI-to-Studio navigation also retained the selected project, using explicit browser fixtures for AI settings/context only. The dev browser test compiles both route graphs first to avoid a first-compilation stylesheet/transition stall.
- Reviewed desktop, light, mobile and 3D screenshots. The physical-obstacle visual snapshot was refreshed for the deliberately changed canvas width; its numerical/dimension assertions remain intact.

The top-bar baseline tooltip now appears below the action so it stays on screen. Drawing tests use a desktop viewport with their drawing coordinates clear of the newly positioned floating controls. Browser fixtures are isolated from user cloud data; no paid model is used.

Production is verified after GitHub's automatic deployment by comparing `/api/version` against the pushed commit and checking the public studio, live playback, responsive inspector, theme application and a real stateless scientific solve through the deployed API. This does not require opening Render or manually deploying a service.
