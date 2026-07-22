import { SUBPROCESSORS } from '@/lib/legal/subprocessors';

// Renders the shared subprocessor register (lib/legal/subprocessors.ts). Used by
// both the public /legal/subprocessors page and the DPA Schedule so the list can
// never diverge.
export function SubprocessorTable() {
  return (
    <table data-testid="subprocessor-table">
      <thead>
        <tr>
          <th>Vendor</th>
          <th>Purpose</th>
          <th>Data processed</th>
          <th>Region</th>
          <th>Transfer</th>
          <th>Retention</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {SUBPROCESSORS.map((s) => (
          <tr key={s.vendor}>
            <td>
              <a href={s.dpaUrl} target="_blank" rel="noreferrer">{s.vendor}</a>
            </td>
            <td>{s.purpose}</td>
            <td>{s.dataProcessed}</td>
            <td>{s.region}</td>
            <td>{s.transferMechanism}</td>
            <td>{s.retention}</td>
            <td>{s.active ? 'Active' : s.note ?? 'Not currently active'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
