'use client';
import { measurementNames, estimatorNames } from '@terralab/shared';
import { useLabView } from '@/lib/lab-view';
import { Button } from './ui/button';
export function LaboratoryPreviewFacts({
  compact = false,
  onOpen,
}: {
  compact?: boolean;
  onOpen?: () => void;
}) {
  const { result, index } = useLabView();
  const row = result?.records[index];
  if (!result || !row) return null;
  const summary = result.summaries.find(
    (s) => s.estimator === row.estimator && s.sweepValue === row.sweepValue,
  );
  return (
    <div className={compact ? 'solver-summary' : 'lab-preview-panel'}>
      <div className="section-title">
        SCIENTIFIC SNAPSHOT · {row.failure ? 'NO FIX' : 'VALID FIX'}
      </div>
      <p className="field-caption">
        {measurementNames[result.request.config.measurement]} · {estimatorNames[row.estimator]} ·{' '}
        {row.time} s · trial {row.trial + 1} · {row.locationId}
      </p>
      <div className="position-error">
        <span>Recorded position error</span>
        <strong data-testid={compact ? 'position-error' : 'lab-position-error'}>
          {row.errorM?.toFixed(3) ?? '—'} <small>m</small>
        </strong>
      </div>
      <div className="solver-facts">
        <span>
          Jacobian condition<b>{row.condition?.toFixed(2) ?? '—'}</b>
        </span>
        <span>
          Normalized residual RMS<b>{row.residualRms?.toFixed(3) ?? '—'} σ</b>
        </span>
        <span>
          Computation time<b>{row.runtimeMs.toFixed(3)} ms</b>
        </span>
        <span>
          Fix availability / failures
          <b>
            {summary?.availability === null
              ? '—'
              : ((summary?.availability ?? 0) * 100).toFixed(1) + '%'}{' '}
            / {summary?.failures ?? 0}
          </b>
        </span>
      </div>
      {row.failure && <p className="small-copy warning">{row.failure}</p>}
      {!compact && (
        <p className="field-caption">
          Frozen experiment output. Network objects show the setup; scientific layers show recorded
          truth/estimates. Clear the overlay to return to the live baseline.
        </p>
      )}
      {onOpen && <Button onClick={onOpen}>Open scientific analytics</Button>}
    </div>
  );
}
