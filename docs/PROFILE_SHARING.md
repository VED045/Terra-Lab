# Profile and sharing — Phase 1 follow-up

The user account dialog now shows a researcher profile when signed in: display name and initials, email, verification state, join date, last sign-in, cloud project count, account ID, editable display name and device-local sign out. Display names are saved through Supabase Auth user metadata; no additional profile table or migration is required. Passwords, session tokens and service credentials are not displayed or exported.

Open the profile using the avatar in the top bar or the account icon in the navigation rail. Signed-out users see registration/sign-in forms. Auth state and metadata changes update the card.

The command bar now has **Share / export**. Opening it pauses playback and captures a reproducible snapshot of the selected enabled receiver (or the first enabled receiver). Choose:

- **Network screenshot:** PNG of the current SVG network viewport, with project name, simulation timestamp and seed. Current geometry, layer visibility, links, truth and estimate are captured. It is a network screenshot, not an operating-system screenshot.
- **Runnable setup:** schema-versioned JSON configuration compatible with project import.
- **Simulation report:** standalone HTML with network diagram, current fix, observed/fitted ranges, residuals, sampled error chart, transmitter coordinates/noise, explicit assumptions and complete configuration. Open the downloaded report and use **Print / Save as PDF** for a PDF copy.
- **Simulation samples:** CSV with timestamped truth, estimated coordinates and position error. Failed fixes are blank values; up to the latest 400 deterministic timestamps are included.

Download is always available after the file is prepared. **Share via device** is enabled only when the browser supports sharing that file through the operating system's share sheet. Otherwise download and attach the file. No public share link, collaboration permission or hosting change is created. Reports do not contain account email, auth tokens or environment keys. User-entered project descriptions/names remain part of the shared configuration.

The report exporter escapes user-controlled text and includes model boundaries: calibrated horizontal ranges, browser QR preview, clock/RF/altitude metadata, geometric obstruction, seeded noise, reference-system conditioning and simulated rather than hardware-measured error. HTML is printable without external fonts, scripts, charts or network resources; the only inline action invokes the browser print dialog.

## Verification

- 77 frontend/shared unit tests pass: includes profile verification/update behavior, metadata validation, deterministic export snapshots, bounded samples, failed fixes, CSV, report fields and HTML escaping.
- Strict TypeScript and the production build pass.
- 20 Python baseline tests pass.
- Supabase now exposes an existing `public.projects` table to the API; an anonymous read is correctly denied (401 / 42501). No anonymous grants were added. Authenticated CRUD, profile updates and Storage require the user's session and were not independently exercised against the live account.
- The previous 14 Chromium workflows were executed for the original Phase 1 baseline. Later settings/profile/export UI changes were not browser-tested in this run because policy blocked observation of the user's in-app tab. The agent did not bypass that restriction. PNG rasterization, native share-sheet behavior, print layout and live signed-in profile UI need a manual acceptance pass in the user's browser.

## Manual acceptance

1. Refresh the app and click the avatar. Confirm your name, email and verification status. Change the display name, save, close and reopen the card.
2. Save/reload a test cloud project and confirm the profile's project count updates.
3. Choose a moving template, scrub to a timestamp and open Share / export. Download PNG and verify the viewport/timestamp; download JSON and re-import it.
4. Download CSV and the report. Confirm truth/estimate values match the timestamp; print the HTML report to PDF.
5. Try device sharing where supported. If unavailable, attach a downloaded file manually.

GitHub target: https://github.com/VED045/Terra-Lab.git. Only source and documentation are committed; local `.env.local`, environments, build output, sessions, and generated personal exports are excluded. The user has authorized pushing the Phase 1 work. No Phase 2 algorithms or experiments are included.
