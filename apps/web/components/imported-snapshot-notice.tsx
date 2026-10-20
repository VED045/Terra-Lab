'use client';
import { useEffect, useState } from 'react';
export function ImportedSnapshotNotice({ id }: { id: string }) {
  const [date, setDate] = useState<string | null>(null);
  useEffect(() => {
    try {
      const info = JSON.parse(localStorage.getItem('terralab.import-provenance.v1') ?? '{}')[id];
      setDate(typeof info?.importedAt === 'string' ? info.importedAt : null);
    } catch {
      setDate(null);
    }
  }, [id]);
  return date ? (
    <p className="info-note">
      Imported experiment snapshot · imported {new Date(date).toLocaleString()}. Source run {id}.
      This is a supplied record; local import does not attest its origin or correctness. Editing or
      rerunning its configuration creates a separate draft/run.
    </p>
  ) : null;
}
