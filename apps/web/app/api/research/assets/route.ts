import { z } from 'zod';
import { guard, errorResponse, privateHeaders } from '../../../../lib/ai/server';
import { activeProject, requireEditor } from '../../../../lib/ai/domain';
import { AIError } from '../../../../lib/ai/contracts';
import { admitInference } from '../../../../lib/ai/admission';
import { toolRateLimit } from '../../../../lib/ai/tools';
import { assetInputSchema, CLOUD_MAX_FILE } from '../../../../lib/research-workspace/contracts';
import { validateResearchFile } from '../../../../lib/research-workspace/files';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  let release = () => {};
  try {
    const identity = await guard(request);
    if (identity.local)
      throw new AIError(
        'local_storage',
        'Local files are stored in this browser, not uploaded to a server.',
      );
    toolRateLimit('research-upload:' + identity.userId);
    release = admitInference('research-upload:' + identity.userId, 45000);
    if (!request.headers.get('content-type')?.startsWith('multipart/form-data;'))
      throw new AIError('invalid_request', 'Use a multipart file upload.');
    const limit = CLOUD_MAX_FILE + 250000;
    if (Number(request.headers.get('content-length') || 0) > limit) throw new RangeError();
    const reader = request.body?.getReader();
    if (!reader) throw new AIError('invalid_request', 'Choose a file.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) throw new RangeError();
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const form = await new Response(bytes, {
      headers: { 'Content-Type': request.headers.get('content-type')! },
    }).formData();
    const metadata = form.get('metadata'),
      file = form.get('file');
    if (typeof metadata !== 'string' || metadata.length > 200000 || !(file instanceof File))
      throw new AIError('invalid_request', 'Choose one supported file and bounded metadata.');
    const input = assetInputSchema.parse(JSON.parse(metadata));
    if (file.size > CLOUD_MAX_FILE)
      throw new AIError(
        'file_too_large',
        'Cloud uploads through TerraLab are limited to 4 MiB. Local mode supports files up to 10 MiB.',
        413,
      );
    const active = await activeProject(identity, { projectId: input.project_id });
    requireEditor(active);
    const actual = await validateResearchFile(file).catch(() => {
      throw new AIError(
        'invalid_file',
        'File contents, signature, dimensions or MIME type are invalid. Choose a supported original file.',
      );
    });
    if (actual.sha256 !== input.sha256 || file.size !== input.bytes || actual.mime !== input.mime)
      throw new AIError('invalid_file', 'File metadata does not match its actual bytes.');
    const path = `${identity.userId}/${input.project_id}/${input.id}.${actual.extension}`;
    const duplicate = await identity
      .db!.from('research_library_assets')
      .select('*')
      .eq('project_id', input.project_id)
      .eq('sha256', actual.sha256)
      .eq('deleted', false)
      .maybeSingle();
    if (duplicate.error)
      throw new AIError(
        'research_unconfigured',
        'Research storage is unavailable. Apply the documented workspace migration.',
        503,
      );
    if (duplicate.data) return Response.json(duplicate.data, { headers: privateHeaders });
    const { error } = await identity
      .db!.storage.from('research-library')
      .upload(path, file, { contentType: actual.mime, upsert: false });
    if (error)
      throw new AIError(
        'upload_failed',
        'Private upload failed. Check the research bucket, permissions and storage quota.',
        503,
      );
    const result = await identity.db!.rpc('record_research_library_asset', {
      p_asset: { ...input, path },
    });
    if (result.error) {
      await identity.db!.storage.from('research-library').remove([path]);
      throw new AIError(
        'upload_failed',
        'Metadata could not be published. Retry or ask the administrator to inspect the research migration.',
        503,
      );
    }
    if (result.data?.id !== input.id)
      await identity.db!.storage.from('research-library').remove([path]);
    return Response.json(result.data, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return errorResponse(new AIError('invalid_file', 'Invalid or oversized file metadata.'));
    return errorResponse(error);
  } finally {
    release();
  }
}
