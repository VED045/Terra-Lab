import { z } from 'zod';
import { AIError, type ProviderId } from './contracts';
import { ollamaBase, providerCall, providerJson, localOllamaModel } from './providers';
import type { AgentMessage, ModelTurn, ToolSpec } from './agent-contracts';

const modelCall = z.object({
  id: z.string().max(120).optional(),
  function: z.object({
    name: z.string().min(1).max(80),
    arguments: z.union([z.string().max(32000), z.record(z.string(), z.unknown())]),
  }),
});
function parseArguments(value: unknown) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
export async function agentTurn(
  provider: ProviderId,
  model: string,
  messages: AgentMessage[],
  tools: ToolSpec[],
  connection: { key: string; signal: AbortSignal },
  forceInspection = false,
): Promise<ModelTurn> {
  const isLocal = provider === 'ollama';
  let localThinking = false;
  if (isLocal) {
    const details = await localOllamaModel(model, connection);
    localThinking = details.capabilities.includes('thinking');
    if (!details.capabilities.includes('tools'))
      throw new AIError(
        'tools_unsupported',
        'This Ollama model does not advertise tool calling. Choose a tools-capable model or use Explanation only.',
        422,
      );
  }
  const endpoint = isLocal
    ? ollamaBase() + '/api/chat'
    : 'https://api.deepseek.com/chat/completions';
  const callNames = new Map(
    messages.flatMap((m) => m.tool_calls?.map((c) => [c.id, c.function.name] as const) ?? []),
  );
  const wireMessages = isLocal
    ? messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.role === 'tool' ? { tool_name: callNames.get(m.tool_call_id || '') } : {}),
        ...(m.tool_calls
          ? {
              tool_calls: m.tool_calls.map((c) => ({
                function: {
                  name: c.function.name,
                  arguments: parseArguments(c.function.arguments),
                },
              })),
            }
          : {}),
      }))
    : messages;
  const body = {
    model,
    messages: wireMessages,
    tools,
    stream: false,
    ...(isLocal
      ? {
          ...(localThinking ? { think: false } : {}),
          options: { num_predict: 2000, num_ctx: 8192 },
        }
      : {
          max_tokens: 3000,
          thinking: { type: 'disabled' },
          ...(forceInspection
            ? { tool_choice: { type: 'function', function: { name: 'inspect_project' } } }
            : {}),
        }),
  };
  const raw = await providerJson(await providerCall(endpoint, connection, body));
  if (isLocal && (raw as { done_reason?: string }).done_reason === 'length')
    throw new AIError(
      'output_limit',
      'The local model did not finish its bounded tool response. No tool success is assumed.',
      422,
    );
  const message = isLocal
    ? z.object({ message: z.unknown() }).parse(raw).message
    : z
        .object({
          choices: z
            .array(z.object({ message: z.unknown(), finish_reason: z.string().nullish() }))
            .min(1),
        })
        .parse(raw).choices[0].message;
  const parsed = z
    .object({
      content: z.string().max(12000).nullish(),
      tool_calls: z.array(modelCall).max(6).optional(),
    })
    .parse(message);
  if (forceInspection && !parsed.tool_calls?.some((c) => c.function.name === 'inspect_project'))
    throw new AIError(
      'tools_unsupported',
      'The selected model did not return the required tool-call format. Choose a compatible model or use Explanation only.',
      422,
    );
  return {
    text: parsed.content || '',
    calls: (parsed.tool_calls ?? []).map((c) => ({
      id: c.id || crypto.randomUUID(),
      name: c.function.name,
      arguments: parseArguments(c.function.arguments),
    })),
  };
}
export async function verifyAgentProvider(
  provider: ProviderId,
  model: string,
  connection: { key: string; signal: AbortSignal },
) {
  const tools: ToolSpec[] = [
    {
      type: 'function',
      function: {
        name: 'inspect_project',
        description: 'Compatibility probe. Call this tool with an empty object.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
  ];
  const turn = await agentTurn(
    provider,
    model,
    [{ role: 'user', content: 'Call inspect_project with {} now. Do not answer in prose.' }],
    tools,
    connection,
    true,
  );
  if (!turn.calls.some((c) => c.name === 'inspect_project' && JSON.stringify(c.arguments) === '{}'))
    throw new AIError('tools_unsupported', 'The provider returned invalid probe arguments.', 422);
  const isLocal = provider === 'ollama';
  const response = await providerJson(
    await providerCall(
      isLocal ? ollamaBase() + '/api/chat' : 'https://api.deepseek.com/chat/completions',
      connection,
      {
        model,
        messages: [
          {
            role: 'user',
            content:
              'Return exactly the JSON object {"compatible":true}. This is a JSON compatibility probe.',
          },
        ],
        stream: false,
        ...(isLocal
          ? {
              format: {
                type: 'object',
                properties: { compatible: { type: 'boolean' } },
                required: ['compatible'],
                additionalProperties: false,
              },
              think: false,
              options: { num_predict: 1024, num_ctx: 4096 },
            }
          : {
              response_format: { type: 'json_object' },
              thinking: { type: 'disabled' },
              max_tokens: 80,
            }),
      },
    ),
  );
  const content = isLocal
    ? z.object({ message: z.object({ content: z.string() }) }).parse(response).message.content
    : z
        .object({
          choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
        })
        .parse(response).choices[0].message.content;
  z.object({ compatible: z.literal(true) })
    .strict()
    .parse(JSON.parse(content));
  return { toolCalling: true, structuredOutput: true, checked: true };
}
