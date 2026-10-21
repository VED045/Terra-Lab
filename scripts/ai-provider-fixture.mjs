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
        capabilities: body.model === 'fixture-embedding' ? ['embedding'] : ['completion'],
      }),
    );
  if (req.url === '/api/chat') {
    const question = body.messages.at(-1)?.content || '';
    if (question.includes('fixture outage')) {
      res.writeHead(503);
      return res.end('{}');
    }
    res.setHeader('Content-Type', 'application/x-ndjson');
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
