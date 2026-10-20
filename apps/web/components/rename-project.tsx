'use client';
import { useState } from 'react';
import { Dialog } from './ui/dialog';
import { Button } from './ui/button';
export function RenameProject({
  name,
  disabled,
  onRename,
}: {
  name: string;
  disabled?: boolean;
  onRename: (name: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [value, setValue] = useState(name),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <>
      <Button
        size="sm"
        disabled={disabled}
        onClick={() => {
          setValue(name);
          setError('');
          setOpen(true);
        }}
      >
        Rename
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!busy) setOpen(v);
        }}
        title="Rename project"
        description="Choose a name of 1–80 characters. Existing experiment snapshots keep their original names."
      >
        <form
          className="rename-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const clean = value.trim();
            if (!clean || clean.length > 80) {
              setError('Enter a name of 1–80 characters.');
              return;
            }
            setBusy(true);
            setError('');
            try {
              await onRename(clean);
              setOpen(false);
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Project name
            <input
              aria-label="Project name"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={busy}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <p className="small-copy">
            Studio changes remain in your draft until saved. Cloud saves use the current revision
            and preserve your unsaved network edits.
          </p>
          <div>
            <Button type="submit" disabled={busy}>
              Apply name
            </Button>{' '}
            <Button type="button" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
