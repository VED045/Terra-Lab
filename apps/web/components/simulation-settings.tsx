'use client';
import { useStudio } from '@/lib/store';
import { NumberField } from './ui/number-field';
import { Button } from './ui/button';
export function SimulationSettings() {
  const { project, edit } = useStudio();
  return (
    <>
      <div className="section-title">SIMULATION CONFIGURATION</div>
      <p className="small-copy">
        Live baseline preview: synthetic calibrated ranges in a horizontal plane. Advanced
        measurement models, estimator comparisons and experiment timing are configured separately in
        Scientific laboratory.
      </p>
      <NumberField
        descriptionId="baseline-duration-help"
        label="Duration"
        value={project.settings.duration}
        unit="s"
        min={1}
        max={3600}
        onChange={(v) =>
          edit((p) => {
            p.settings.duration = v;
          })
        }
      />
      <p id="baseline-duration-help" className="small-copy">
        Baseline playback duration in seconds, up to 3,600 s (60 minutes). Laboratory trajectory
        duration is configured separately.
      </p>
      <div className="duration-presets">
        {[60, 120, 300, 600, 3600].map((v) => (
          <Button
            key={v}
            size="sm"
            onClick={() =>
              edit((p) => {
                p.settings.duration = v;
              })
            }
          >
            {v / 60} min
          </Button>
        ))}
      </div>
      <NumberField
        label="Time step"
        value={project.settings.step}
        unit="s"
        min={0.1}
        max={1}
        onChange={(v) =>
          edit((p) => {
            p.settings.step = v;
          })
        }
      />
      <NumberField
        label="Random seed"
        value={project.settings.seed}
        min={0}
        max={2147483647}
        step={1}
        onChange={(v) =>
          edit((p) => {
            p.settings.seed = v;
          })
        }
      />
      <label className="select-field">
        Solver engine
        <select
          value={project.settings.engine}
          onChange={(e) =>
            edit((p) => {
              p.settings.engine = e.target.value as 'browser' | 'python';
            })
          }
        >
          <option value="browser">Browser · Householder QR</option>
          <option value="python">Python API · SVD</option>
        </select>
      </label>
      <label className="check-row">
        <input
          type="checkbox"
          checked={project.settings.excludeBlocked}
          onChange={(e) =>
            edit((p) => {
              p.settings.excludeBlocked = e.target.checked;
            })
          }
        />
        Exclude obstructed links
      </label>
      <div className="info-note">
        Obstructions are geometric flags only. Use Scientific laboratory for explicit propagation
        and clock-error models.
      </div>
      <div className="section-title">MEASUREMENT MODEL</div>
      <div className="model-equation">rᵢ = ‖p − aᵢ‖ + εᵢ</div>
      <p className="small-copy">
        This baseline uses distance plus noise to isolate the effects of transmitter geometry and
        range uncertainty. It gives repeatable comparisons before adding propagation and clock
        errors in Scientific laboratory.
      </p>
      <dl className="model-definitions">
        <div>
          <dt>rᵢ</dt>
          <dd>Simulated range from transmitter i to the receiver, in metres.</dd>
        </div>
        <div>
          <dt>p</dt>
          <dd>Receiver position (x, y), which the solver estimates.</dd>
        </div>
        <div>
          <dt>aᵢ</dt>
          <dd>Known position (x, y) of transmitter i.</dd>
        </div>
        <div>
          <dt>‖p − aᵢ‖</dt>
          <dd>Straight-line Euclidean distance in the horizontal 2D plane.</dd>
        </div>
        <div>
          <dt>εᵢ</dt>
          <dd>
            Independent, zero-mean Gaussian range error. The noise setting controls its standard
            deviation in metres; the seed makes it reproducible.
          </dd>
        </div>
      </dl>
      <p className="small-copy">
        This is a calibrated-range model. Clock and RF properties are stored metadata in this
        baseline; they do not change these ranges.
      </p>
    </>
  );
}
