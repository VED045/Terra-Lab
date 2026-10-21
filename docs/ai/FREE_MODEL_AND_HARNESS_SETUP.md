# OpenCode Free, DeepSeek Harness, and TerraLab

Verified on 21 October 2026. OpenCode desktop **v2.1.2** is installed at `C:\Users\Ved\AppData\Local\Programs\@opencodedesktop\OpenCode.exe`; its bundled CLI is `resources\opencode-cli.exe`.

## Use the free model in OpenCode

1. Open your installed OpenCode desktop application.
2. In the model picker, select **DeepSeek V4.1 Flash Free**, whose ID is `opencode/deepseek-v4.1-flash-free`.
3. Send a small request inside OpenCode. Its free availability, limits and retention terms can change; review the current [official model catalogue](https://opencode.ai/v2/docs/console/models).

Your installed CLI independently lists that ID. In PowerShell, without changing PATH:

```powershell
& "$env:LOCALAPPDATA\Programs\@opencodedesktop\resources\opencode-cli.exe" --version
& "$env:LOCALAPPDATA\Programs\@opencodedesktop\resources\opencode-cli.exe" models --standalone
```

The installed v2 CLI does not accept the older positional `models opencode` command. The model-list check confirms availability in the application; no OpenCode coding agent was run on your repository and no saved credentials were read.

## Why that free route is not a TerraLab API backend

The official catalogue advertises `deepseek-v4.1-flash-free` as a limited-time free offering. However, direct requests from this environment to both the current inference endpoint and the legacy Zen Chat Completions endpoint returned **HTTP 403 / FreeTierError**. The service explicitly restricted free-tier inference to OpenCode itself. The requests contained only a tiny public test prompt and no credentials or project data.

Installing OpenCode therefore does not grant TerraLab free external API inference. TerraLab does not impersonate OpenCode, forward through its coding-agent runtime, copy its credentials or silently switch to the separately priced model. No free-provider selector was added that would imply this rejected route works.

## Download and run the free Harness software

Harness is the agent application, not the model or an inference credit balance. The [official project](https://github.com/deepseek-ai/deepseek-harness) is MIT licensed and in developer preview; expect compatibility changes. The version verified for this work is `0.2.1-rc.2`.

1. Use a supported Node.js version. The inspected source declares `^22.19.0 || >=24.0.0`; check `node --version` first.
2. Open PowerShell in a **disposable workspace** that contains no private keys or important working files. Harness can access files and run commands; keep it separate from TerraLab's production data and credentials.
3. Download and start the pinned package:

   ```powershell
   npx --yes @deepseek-ai/dsh@0.2.1-rc.2 web
   ```

4. Open the loopback URL printed by the command, normally `http://127.0.0.1:3080`.
5. In Settings → Models, configure a supported inference provider. The default DeepSeek route needs your own API key. For another supported endpoint, use its documented custom-provider configuration; OpenCode's rejected free API route does not become usable merely because it is configured in Harness.
6. Choose the disposable workspace and start a small task. Keep permission prompts enabled and inspect requested operations.

These are setup instructions; Harness was **not installed or launched** during this task. See the [official quickstart](https://deepseek-harness.github.io/deepseek-harness/en/guide/quickstart), [provider configuration](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/providers.md), and [safety notice](https://github.com/deepseek-ai/deepseek-harness/blob/master/SAFETY.md). Installing the software is free; hosted inference is governed by the chosen provider.

## Use a model in TerraLab

**Hosted DeepSeek:** sign in through Projects, open AI Studio → Provider settings, and securely save your own DeepSeek API key. The administrator must configure the existing server encryption key. Check connection, select a returned model, then use **Verify tool compatibility** before a research-agent workflow. This route may bill your DeepSeek account; no shared or default paid key is supplied.

**Optional local Ollama:** manually install Ollama and a model that fits your hardware and advertises tool calling. Enable `TERRALAB_AI_LOCAL_DEV=1` and `TERRALAB_AI_OLLAMA_ENABLED=1` on a local TerraLab development server. Set the loopback Ollama URL if necessary, check the connection, manually choose the installed model, then verify tool compatibility. TerraLab downloads no models. A remote server cannot reach your computer through its own localhost. A model named DeepSeek is not assumed to support tools or to fit your machine merely because OpenCode offers a hosted DeepSeek model.

For a concrete local DeepSeek download to try later:

1. Install the official [Ollama Windows application](https://ollama.com/download/windows). Its [Windows documentation](https://docs.ollama.com/windows) describes the background server at `http://localhost:11434`.
2. In PowerShell, download the small [DeepSeek-R1 1.5B distilled model](https://ollama.com/library/deepseek-r1:1.5b), currently about 1.1 GB of model files:

   ```powershell
   ollama pull deepseek-r1:1.5b
   ollama list
   ```

   This is an older distilled R1 model, not V4.1 Flash, and a small model is not expected to match hosted model quality. The file size is not a guarantee that your available RAM/GPU can run the chosen context efficiently. Local execution has no hosted token bill but uses your hardware and electricity.

3. From the TerraLab repository in a separate PowerShell terminal, enable the existing explicit local settings and start development:

   ```powershell
   $env:TERRALAB_AI_LOCAL_DEV = '1'
   $env:TERRALAB_AI_OLLAMA_ENABLED = '1'
   npm run dev
   ```

4. Open local AI Studio, choose **Ollama (local, optional)**, click **Check connection**, and select the exact installed `deepseek-r1:1.5b` entry.
5. Start with **Research agent unchecked** for explanation-only chat. For simulator actions, check it and click **Verify tool compatibility**. If the specific model does not advertise and correctly execute native tool calls plus JSON output, stay in explanation mode or manually select a tools-capable model; listing the model alone does not prove compatibility.

The official [DeepSeek V4.1 Flash Ollama entry](https://ollama.com/library/deepseek-v4.1-flash) currently lists `:cloud` variants with inference pricing. That is remote inference, not a free V4.1 model download onto your PC. None of these install/download/start commands were executed during this task; live setup remains deferred as requested.

Exact environment and credential instructions remain in [PROVIDER_SETUP.md](PROVIDER_SETUP.md). You chose to finish code and real simulation tests now and defer live inference until you configure a supported provider. Accordingly, no live model success is claimed.
