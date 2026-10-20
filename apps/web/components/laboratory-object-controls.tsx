'use client';
import { useState } from 'react';
import { useStudio } from '@/lib/store';
import { NumberField } from './ui/number-field';
const specifications = [
  {
    key: 'timingOffset',
    label: 'Transmitter timing offset',
    unit: 'ns',
    min: -10000,
    max: 10000,
    step: 0.1,
    default: 0,
    kind: 'anchor',
    description:
      'Residual one-way transmitter synchronization error. Cancels for RTT; reference differencing retains differential errors.',
  },
  {
    key: 'timingUncertainty',
    label: 'Anchor timing uncertainty',
    unit: 'ns sigma',
    min: 0,
    max: 1000,
    step: 0.1,
    default: 0,
    kind: 'anchor',
    description:
      'Independent Gaussian jitter, combined in quadrature with experiment timing uncertainty.',
  },
  {
    key: 'hardwareDelay',
    label: 'Anchor equipment delay',
    unit: 'ns',
    min: -10000,
    max: 10000,
    step: 0.1,
    default: 0,
    kind: 'anchor',
    description: 'Residual delay adds c·delay to TOA and c·delay/2 to RTT before RTT calibration.',
  },
  {
    key: 'noise',
    label: 'Anchor range noise',
    unit: 'm sigma',
    min: 0,
    max: 1000,
    step: 0.01,
    default: 0.15,
    kind: 'anchor',
    description: 'Independent range-domain Gaussian noise added to the timing-derived uncertainty.',
  },
  {
    key: 'power',
    label: 'Anchor transmit power',
    unit: 'dBm',
    min: -100,
    max: 100,
    step: 1,
    default: 20,
    kind: 'anchor',
    description: 'Sets received power and therefore RSS observations and detection/availability.',
  },
  {
    key: 'frequency',
    label: 'Anchor frequency',
    unit: 'MHz',
    min: 0.001,
    max: 100000,
    step: 0.001,
    default: 3960,
    kind: 'anchor',
    description: 'Frequency correction is 20log10(f/f0) dB in the empirical link budget.',
  },
  {
    key: 'bandwidth',
    label: 'Anchor bandwidth',
    unit: 'MHz',
    min: 0.001,
    max: 10000,
    step: 0.001,
    default: 160,
    kind: 'anchor',
    description: 'Sets integrated receiver noise power for the SNR detection threshold.',
  },
  {
    key: 'clockOffset',
    label: 'Receiver clock offset',
    unit: 'ns',
    min: -10000,
    max: 10000,
    step: 0.1,
    default: 0,
    kind: 'receiver',
    description:
      'Adds c·offset to one-way ranges; estimated as clock bias by pseudorange estimators and cancels in TDOA/RTT.',
  },
  {
    key: 'clockDrift',
    label: 'Clock drift',
    unit: 'ppm',
    min: -10,
    max: 10,
    step: 0.0001,
    default: 0,
    kind: 'both',
    description:
      'One-way clock error grows by 1,000·drift·t ns. RTT receiver clock rate scales measured round-trip duration.',
  },
] as const;
export function LaboratoryObjectControls() {
  const objects = useStudio((s) => s.project.objects),
    update = useStudio((s) => s.update);
  const [id, setId] = useState('');
  const choices = objects.filter(
    (o) => (o.kind === 'anchor' || o.kind === 'receiver') && o.enabled,
  );
  const object = choices.find((o) => o.id === id) ?? choices[0];
  if (!object) return null;
  return (
    <details className="lab-control-group">
      <summary>Per-object timing and radio parameters</summary>
      <label className="select-field">
        Network object
        <select
          aria-label="Laboratory timing object"
          value={object.id}
          onChange={(e) => setId(e.target.value)}
        >
          {choices.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      {specifications
        .filter((p) => p.kind === 'both' || p.kind === object.kind)
        .map((p) => {
          const value = Number((object as unknown as Record<string, unknown>)[p.key]);
          return (
            <div className="lab-parameter" key={p.key}>
              <NumberField
                label={p.label}
                value={value}
                unit={p.unit}
                min={p.min}
                max={p.max}
                step={p.step}
                onChange={(n) => update(object.id, { [p.key]: n })}
              />
              <input
                type="range"
                aria-label={`${p.label} slider`}
                min={p.min}
                max={p.max}
                step={p.step}
                value={value}
                onChange={(e) => update(object.id, { [p.key]: Number(e.target.value) })}
              />
              <p>
                {p.description} Default: {p.default} {p.unit}.
              </p>
            </div>
          );
        })}
      <p className="field-caption">
        These controls edit the existing network objects. Position/mobility controls remain in the
        studio inspector. Device type is a descriptive label; altitude is excluded from all
        horizontal 2D equations.
      </p>
    </details>
  );
}
