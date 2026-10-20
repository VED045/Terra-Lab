# Reproduce and validate research

Use Node 24.19.0/Python 3.12 as tested; install with the root lockfile and pinned Python requirements. The numerical positioning model remains 0.2.0. Runtime, timestamps, UUIDs and scheduling are not cross-machine accuracy guarantees.

```powershell
npm ci
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r services/api/requirements-dev.txt
npm test
npm run test:python
npm run test:database
npm run typecheck
npm run build
node scripts/python.mjs scripts/benchmark_phase2.py --trials 100
node scripts/python.mjs scripts/benchmark_phase2.py --trials 100 --clean --out docs/examples/timing-clean
node scripts/python.mjs scripts/example_phase3.py
```

The first two examples regenerate the committed six-anchor/three-location/100-trial paired TOA studies. They remain local scientific reference outputs. The Phase 3 example generates actual CSI JSON and a vector PDF using the committed clean run, without inventing another positioning calculation. Output defaults to ignored `.terralab/phase3-example`; use `--out` to choose a folder.

To validate the real Next route → local FastAPI integration, start an isolated API and run the opt-in test:

```powershell
$env:TERRALAB_DATA_DIR='.terralab/integration'
node scripts/python.mjs -m uvicorn terralab.main:app --app-dir services/api --host 127.0.0.1 --port 18002
# Separate terminal:
$env:RUN_SCIENCE_INTEGRATION='1'
$env:SIMULATION_API_URL='http://127.0.0.1:18002'
npm exec vitest -- run apps/web/app/api/laboratory/integration.test.ts
```

The database harness executes migrations and permissions in actual PostgreSQL WASM using fixture Auth/Storage tables. Its source identifies every authorization assertion. It cannot establish hosted HTTP upload/Auth behavior. New Playwright workflows cover workspace controls, actual fixture exports and CSI controls; they require permitted browser automation and the dev server. Browser tests were not run in this implementation session because access to the user's tab was policy-blocked; no bypass was used. Production authentication/roles/Storage/API flows must follow DEPLOYMENT.md with real users.

Every numerical comparison must retain failed attempts and disclose conditional error statistics, exact noise/mobility model, seed, units and software version. Reuse matched frame hashes across estimators. Do not compare runtime recorded under different host load as an algorithmic speed guarantee. Include unweighted NLS when separating weighting from linearization. Robust methods need not improve every distribution. Do not cite the synthetic CSI example as MBWDE or real-radio validation.
