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
        Calibrated 2D ranges · metres. Independent seeded Gaussian range noise per transmitter.
        Clock and RF properties are stored metadata in this phase.
      </p>
    </>
  );
}
