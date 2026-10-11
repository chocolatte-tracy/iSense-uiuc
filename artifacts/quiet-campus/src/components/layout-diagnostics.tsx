import { useState } from 'react';
import { collectLayoutDiagnostics } from '@/lib/layout-diagnostics';

export function LayoutDiagnostics() {
  const [snapshot, setSnapshot] = useState<ReturnType<typeof collectLayoutDiagnostics> | null>(null);
  const measure = () => { const result = collectLayoutDiagnostics(); setSnapshot(result); return result; };
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(measure(), null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'isense-layout-measurements.json';
    document.body.append(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <details className="layout-diagnostics">
    <summary>Layout measurements</summary>
    <p>For checking an installed PWA. Records screen geometry only—not places, API keys or saved settings.
      Standalone detection alone does not prove physical-device testing.</p>
    {snapshot?.viewportPolicy === 'standalone-platform-limited' && <p role="status">
      iOS is not exposing the larger CSS viewport as an interactive area. Moving navigation
      into it would make controls unreachable. A zero web-layout gap does not rule out a
      system-owned strip; check the complete screenshot and iOS/PWA installation version.
    </p>}
    <div className="layout-diagnostics-controls">
      <button type="button" onClick={measure}>Measure layout</button>
      <button type="button" onClick={download}>Download measurements</button>
    </div>
    {snapshot && <pre aria-label="Current layout measurements">{JSON.stringify(snapshot, null, 2)}</pre>}
  </details>;
}
