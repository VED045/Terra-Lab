'use client';
import { useStudio } from '@/lib/store';
import { workspaceThemes, type WorkspaceTheme } from '@terralab/shared';
import { cloudStatusText, type AuthState } from '@/lib/auth-session';
import { SimulationSettings } from './simulation-settings';
import { Dialog } from './ui/dialog';
import { Button } from './ui/button';

export function SettingsDialog({
  auth,
  open,
  onOpenChange,
  onAccount,
}: {
  auth: AuthState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccount: () => void;
}) {
  const { project, edit } = useStudio();
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Workspace settings"
      description="Configure this project's simulation, appearance and cloud connection."
      wide
    >
      <div className="settings-grid">
        <section>
          <SimulationSettings />
        </section>
        <section>
          <div className="section-title">APPEARANCE & CANVAS</div>
          <label className="select-field">
            Theme
            <select
              aria-label="Workspace theme"
              value={project.canvas.theme}
              onChange={(event) =>
                edit((p) => {
                  p.canvas.theme = event.target.value as WorkspaceTheme;
                })
              }
            >
              {workspaceThemes.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.name}
                </option>
              ))}
            </select>
          </label>
          <div className="theme-swatches" aria-label="Theme previews">
            {workspaceThemes.map((theme) => (
              <button
                key={theme.id}
                type="button"
                className="theme-swatch"
                aria-label={`Use ${theme.name} theme`}
                aria-pressed={project.canvas.theme === theme.id}
                onClick={() =>
                  edit((p) => {
                    p.canvas.theme = theme.id;
                  })
                }
              >
                <span
                  className="theme-preview"
                  style={{ background: theme.background, color: theme.accent }}
                  aria-hidden="true"
                >
                  <span />
                  <span />
                  <span />
                </span>
                <span>{theme.name}</span>
              </button>
            ))}
          </div>
          <p className="field-caption">
            Theme is saved with this project. The rail shortcut cycles through all ten palettes.
          </p>
          {(
            [
              { key: 'grid', label: 'Show grid' },
              { key: 'labels', label: 'Show object labels' },
              { key: 'snap', label: 'Snap objects to 5 m grid' },
              { key: 'links', label: 'Show measurement links' },
              { key: 'estimates', label: 'Show position estimates' },
            ] as const
          ).map(({ key, label }) => (
            <label className="check-row" key={key}>
              <input
                type="checkbox"
                checked={project.canvas[key]}
                onChange={(event) =>
                  edit((p) => {
                    p.canvas[key] = event.target.checked;
                  })
                }
              />
              {label}
            </label>
          ))}
          <div className="property-section">
            <div className="section-title">PROJECT PERSISTENCE</div>
            <p className="small-copy">
              Edits save automatically after 1.5 seconds. Local saves remain available without a
              cloud account.
            </p>
          </div>
          <div className="property-section">
            <div className="section-title">SUPABASE CONNECTION</div>
            <p className="small-copy">{cloudStatusText(auth)}</p>
            {projectUrl && (
              <p className="settings-project-url">
                <code>{projectUrl}</code>
              </p>
            )}
            <Button
              onClick={() => {
                onOpenChange(false);
                onAccount();
              }}
            >
              Manage account & sync
            </Button>
            <p className="field-caption">
              Cloud saves also require the TerraLab database migration. Public configuration does
              not grant database administration access.
            </p>
          </div>
        </section>
      </div>
    </Dialog>
  );
}
