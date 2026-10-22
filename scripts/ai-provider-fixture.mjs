// Test-only Ollama protocol fixture. No inference, downloads, credentials or production resources.
import { createServer } from 'node:http';

const server = createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/health') return res.end('{"fixture":true}');
  if (req.url === '/api/tags')
    return res.end(
      JSON.stringify({ models: [{ name: 'fixture-text' }, { name: 'fixture-embedding' }] }),
    );
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 200000) {
      res.writeHead(413);
      return res.end('{}');
    }
  }
  const body = JSON.parse(raw || '{}');
  if (req.url === '/api/show')
    return res.end(
      JSON.stringify({
        capabilities: body.model === 'fixture-embedding' ? ['embedding'] : ['completion', 'tools'],
      }),
    );
  if (req.url === '/api/chat') {
    if (body.format)
      return res.end(JSON.stringify({ message: { content: '{"compatible":true}' }, done: true }));
    if (body.tools) {
      const user = body.messages.filter((m) => m.role === 'user').at(-1)?.content || '';
      const responses = body.messages.filter((m) => m.role === 'tool');
      let name, args;
      if (!responses.length) {
        name = 'inspect_project';
        args = {};
      } else if (/six anchors|six-anchor/i.test(user)) {
        name = 'propose_network_changes';
        args = {
          reason: 'Protocol fixture requests real validated placements for workflow A.',
          operations: [
            ...[
              [0, 0],
              [50, 0],
              [100, 0],
              [100, 80],
              [50, 80],
              [0, 80],
            ].map(([x, y]) => ({ op: 'add', kind: 'anchor', x, y })),
            ...[
              [25, 20],
              [50, 40],
              [75, 60],
            ].map(([x, y]) => ({ op: 'add', kind: 'receiver', x, y })),
          ],
        };
      } else if (/compare estimators|run.*experiment/i.test(user)) {
        name = 'propose_experiment';
        args = {
          reason: 'Compare actual matched generated observations.',
          config: {
            measurement: 'toa',
            estimators: ['ls', 'wls', 'huber'],
            trials: 2,
            sweep: 'none',
            duration: 0,
            timingNs: 0,
            noiseM: 0,
            seed: 42,
          },
        };
      } else if (/noise parameter/i.test(user) && responses.length === 1) {
        name = 'inspect_parameters';
        args = { parameter: 'timingNs' };
      } else if (/noise parameter/i.test(user)) {
        name = 'propose_parameter_change';
        args = {
          target: 'laboratory',
          values: { timingNs: 2, sweep: 'none', trials: 2 },
          reason: 'Controlled timing-noise change; verify actual effects with a separate run.',
        };
      } else if (/obstacle/i.test(user)) {
        name = 'propose_network_changes';
        args = {
          reason:
            'Test implemented geometric blockage and approximate laboratory NLOS, not full-wave RF.',
          operations: [
            { op: 'add', kind: 'obstacle', x: 40, y: 30, properties: { width: 12, height: 8 } },
          ],
        };
      } else if (/diagnos|failed|latest|poor accuracy/i.test(user) && responses.length === 1) {
        name = 'inspect_run';
        args = {};
      } else if (/diagnos|failed|poor accuracy/i.test(user) && responses.length === 2) {
        name = 'diagnose_geometry';
        args = {};
      } else
        return res.end(
          JSON.stringify({
            message: {
              content:
                'Protocol fixture finished the actual tool reads. Inspect the verified timeline and real metrics; no model inference is claimed.',
            },
            done: true,
          }),
        );
      return res.end(
        JSON.stringify({
          message: {
            content:
              'Protocol fixture plan: inspect actual state, validate the requested operation and require review before writes.',
            tool_calls: [{ function: { name, arguments: args } }],
          },
          done: true,
        }),
      );
    }
    const question = body.messages.at(-1)?.content || '';
    if (question.includes('fixture outage')) {
      res.writeHead(503);
      return res.end('{}');
    }
    res.setHeader('Content-Type', 'application/x-ndjson');
    if (question === 'fixture formatted long') {
      const text =
        '## Network review\n**Measured facts**\n\n1. Inspect the saved configuration.\n2. Review the actual run.\n\n\x60\x60\x60json\n{"timingNs":1}\n\x60\x60\x60\n\n| Estimator | RMSE |\n| --- | --- |\n| LS | unavailable |\n\n' +
        Array.from(
          { length: 32 },
          (_, i) =>
            'Paragraph ' +
            (i + 1) +
            ': This is explicitly simulated provider prose for scrolling and formatting acceptance. No measured result is claimed.\n\n',
        ).join('');
      let offset = 0;
      const timer = setInterval(() => {
        if (offset >= text.length) {
          clearInterval(timer);
          res.end('{"done":true}\n');
          return;
        }
        res.write(
          JSON.stringify({ message: { content: text.slice(offset, offset + 110) }, done: false }) +
            '\n',
        );
        offset += 110;
      }, 80);
      res.on('close', () => clearInterval(timer));
      return;
    }
    const summary = JSON.parse(body.messages[0].content.split('PROJECT SUMMARY:\n')[1]);
    const text = `Protocol fixture: verified summary contains ${summary.objects.anchors.total} anchors. Geometry affects dilution of precision. No experiment was executed.`;
    res.write(JSON.stringify({ message: { content: text }, done: false }) + '\n');
    if (question.includes('fixture slow')) {
      const timer = setTimeout(() => res.end('{"done":true}\n'), 15000);
      res.on('close', () => clearTimeout(timer));
      return;
    }
    return res.end('{"done":true}\n');
  }
  res.writeHead(404);
  res.end('{}');
});
server.listen(11444, '127.0.0.1');
