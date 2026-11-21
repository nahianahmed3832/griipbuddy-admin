const csvCell = (value: string) => {
  const escaped = /^[\s\u200B\uFEFF]*[=+@-]|^[\r\n\t]/.test(value) ? "'" + value : value;
  return '"' + escaped.replaceAll('"', '""') + '"';
};

export function serializeCsv(rows: string[][]) {
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}

export function downloadCsv(name: string, rows: string[][]) {
  const href = URL.createObjectURL(new Blob([serializeCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = href;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
