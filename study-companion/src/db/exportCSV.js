import { exportAllDataAsRows } from './db';

/**
 * Converts session/message rows into a downloadable CSV file.
 * this is the only way to collect usage data for evaluation.
 */
export async function exportSessionsToCSV() {
  try {
    const rows = await exportAllDataAsRows();

    if (rows.length === 0) {
      return null;
    }

    const headers = ['sessionId', 'sessionTitle', 'role', 'content', 'inputMode', 'emotionalState', 'fusedScore', 'createdAt'];

    const escapeCsvField = (value) => {
      const str = String(value ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvLines = [
      headers.join(','),
      ...rows.map(row => headers.map(h => escapeCsvField(row[h])).join(',')),
    ];

    const csvContent = csvLines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `studymate_session_export_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(url), 1000);

    return rows.length;

  } catch (error) {
    console.error('❌ CSV export failed:', error);
    throw error;
  }
}