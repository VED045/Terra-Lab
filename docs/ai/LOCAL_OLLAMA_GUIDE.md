# Use TerraLab AI Studio with free local Ollama models

This laptop is configured with downloaded `qwen3:4b-instruct-2507-q4_K_M` and `deepseek-r1:8b` weights. The TerraLab local profile disables cloud inference and hosted credentials. You do not need an Ollama API key, DeepSeek API key, OpenCode, or `ollama launch` to use it.

## 1. Start the local profile

Open PowerShell and run these as separate lines:

```powershell
Set-Location 'C:\Users\Ved\Desktop\TerraLab'
node scripts/start-local-ai.mjs
```

Keep your existing Ollama desktop app running if you use it. The launcher manages a separate loopback Ollama process on 11435, the scientific API on 18040, and TerraLab on 13040. It does not download models at startup. You may close the PowerShell window after startup.

The ordinary TerraLab dev server on port 3000 can stay running. The local AI server now uses its own `.next-local-ai` cache and lock; it does not reuse or stop the port-3000 server. Repeating the launcher reuses healthy owned services and does not start duplicates.

## 2. Open the correct TerraLab URL

Open [local AI Studio](http://127.0.0.1:13040/ai). Use **13040** for this free local profile. Your ordinary port-3000 or hosted site can have different provider settings and a different browser project store.

If your project is only on port 3000 or the hosted site, export that project as TerraLab JSON there. Open [Projects on 13040](http://127.0.0.1:13040/projects) and import the JSON. Alternatively, create a network in [Network studio on 13040](http://127.0.0.1:13040/studio), then choose **AI Studio**. That button saves current changes before opening the same project.

Browser storage belongs to each origin, including its port: a local project on port 3000 is not automatically a local project on 13040. Importing is an explicit local copy; it does not synchronize edits back to the cloud project.

## 3. Select a project and connect the model

1. In AI Studio, choose **Saved project**. The selected network appears in the collapsible **Project canvas** panel.
2. The configured provider should be **Ollama (local, optional)**. Click **Check connection** to list installed local models.
3. Choose **qwen3:4b-instruct-2507-q4_K_M** for research-agent tools.
4. Keep **Research agent** checked and click **Verify tool compatibility**. This performs real tool-call and structured-JSON probes; a model-list connection check alone does not verify tools.
5. Wait for verification, then send a request.

The Instruct model is the tested tool-capable choice on this laptop. The generic `qwen3:4b` thinking model was not reliable within the application's response budget and is not the configured choice.

## 4. Use the same canvas in both places

AI Studio uses the actual Network studio 2D renderer: the same grid, geometry, symbols, labels, paths, visual layers and calibrated-range baseline. Its preview has an isolated viewport and starts at t = 0 s; it does not display an unrelated laboratory result.

- Pan, zoom, fit, select and change preview layers. These view controls do not edit the project or the editor's undo history.
- Click **Project canvas** to collapse or reopen it.
- Click **Edit canvas** to open that selected saved project in Network studio.
- Make edits there, then click the visible **AI Studio** button to save and return with the same project selected. A save conflict/error preserves the draft and blocks navigation.

## 5. Ask for bounded research work

Examples:

- “Inspect this network and explain its anchor and receiver geometry.”
- “Explain timing uncertainty using the supported parameter definitions.”
- “Prepare a two-trial experiment using LS and WLS, seed 42. Show the configuration for review.”
- “Inspect my latest completed run and separate measured findings from possible causes of poor accuracy.”

Use **Research workflows and task recovery** for controlled parameter studies, network construction, accuracy evidence and fixed-command regression tests. Proposed edits, experiments and tests require review before execution. Submission is not completion: inspect the actual terminal state and recorded results.

## 6. Use DeepSeek for explanations

Choose **deepseek-r1:8b**. The configured analysis-model selection switches to explanation mode. It has produced a real answer on this laptop, but its native agent compatibility probe timed out, so it is not the recommended research-tool model. It can take substantially longer than Qwen Instruct. No hosted DeepSeek V4.1 endpoint is used by this local profile.

## 7. Stop, inspect or restart

```powershell
node scripts/start-local-ai.mjs --status
node scripts/start-local-ai.mjs --stop
node scripts/start-local-ai.mjs
```

`--stop` checks recorded process identity and stops only this profile's owned processes. It does not stop your ordinary port-3000 server or signed-in Ollama desktop app. Logs are in `.terralab/local-ai/web.err.log`, `web.out.log`, and the corresponding API/Ollama logs.

If a child exits during startup, the launcher reports the actual failure promptly. It does not wait through a full readiness timeout or spawn another copy of a known unhealthy process. If startup was interrupted, use `--status`, then the owned-process stop/restart commands above.

**Stop response** stops inference. A separately submitted simulation/test needs its own reviewed cancellation. If status polling reaches the request limit, it waits through the cooldown and rereads the same job without resubmitting work.

Local Ollama remains on loopback. A remote deployed site cannot directly use this laptop's local model; no public tunnel or paid fallback is configured.
