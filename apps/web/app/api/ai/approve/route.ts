import { guard, body, errorResponse, privateHeaders } from '../../../../lib/ai/server';
import { approvalRequestSchema } from '../../../../lib/ai/agent-contracts';
import { applyApproval } from '../../../../lib/ai/approvals';
import { auditTool, toolRateLimit } from '../../../../lib/ai/tools';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const identity = await guard(request);
    toolRateLimit(identity.userId);
    const input = approvalRequestSchema.parse(await body(request, 500000));
    try {
      const result = await applyApproval(
        request,
        identity,
        input.context,
        input.token,
        input.decision,
      );
      auditTool(
        identity,
        input.context.projectId,
        'reviewed_action',
        result.state,
        'Human decision processed through validated domain adapter',
      );
      return Response.json(result, { headers: privateHeaders });
    } catch (error) {
      auditTool(
        identity,
        input.context.projectId,
        'reviewed_action',
        'failed',
        'Approval or domain write rejected',
      );
      throw error;
    }
  } catch (error) {
    return errorResponse(error);
  }
}
