import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { utils, write, type CellObject } from 'xlsx';
import { stockCurrency, stockValue, type StockSummary, type StockViewRow } from './production-stock';

type Permission = { cost: boolean; profit: boolean };
type StockExport = {
  rows: StockViewRow[]; summary: StockSummary; permission: Permission; locations: string;
  skuQuery?: string; searchQuery?: string; generatedAt: string;
};
type Column = {
  header: string; pdf: string; excelWidth: number; pdfWidth: number; numeric?: boolean; total?: boolean;
  get: (row: StockViewRow) => string | number | null;
  display?: (value: number | null) => string;
};

const displayQuantity = (value: number | null) => value === null ? '—' : `${value} Pair/pcs`;
const reportColumn = (header: string, excelWidth: number, pdf: string, pdfWidth: number,
  get: Column['get'], display?: Column['display'], total?: boolean): Column =>
  ({ header, excelWidth, pdf, pdfWidth, get, display, numeric: Boolean(display), total });

function exportColumns(permission: Permission) {
  return [
    reportColumn('Product Name', 60, 'Product Name', 45, row => row.title),
    reportColumn('SKU', 25, 'SKU', 28, row => row.sku || '-'),
    reportColumn('Location', 35, '', 0, () => ''),
    ...(permission.cost ? [reportColumn('Avg Purchase Price (Tk)', 18, 'Avg Purchase Price', 24, row => row.cost === null ? null : Math.round(row.cost), stockCurrency)] : []),
    reportColumn('Sale Price (Tk)', 16, 'Sale Price', 24, row => row.price, stockCurrency),
    reportColumn('Available Qty (Pair/pcs)', 20, 'Available Qty', 28, row => row.quantity, displayQuantity, true),
    ...(permission.cost ? [reportColumn('Current Stock Purchase Value (Tk)', 26, 'Current Stock Value (purchase)', 28,
      row => stockValue(row.cost, row.quantity), stockCurrency, true)] : []),
    reportColumn('Potential Sale Value (Tk)', 22, 'Potential Sale Value', 28, row => stockValue(row.price, row.quantity), stockCurrency, true),
    ...(permission.profit ? [reportColumn('Potential Profit (Tk)', 18, 'Potential Profit', 28, row => row.profit, stockCurrency, true)] : []),
    reportColumn('Total Sold (Pair/pcs)', 20, 'Total Sold', 15, row => row.sold, displayQuantity, true),
  ];
}

export function stockExcel({ rows, summary, permission, locations, generatedAt }: StockExport) {
  const columns = exportColumns(permission);
  const values = rows.map(row => columns.map(column => column.header === 'Location' ? locations : column.get(row) ?? '-'));
  const totalsIndex = rows.length + 1;
  const summaryRows = [
    ['Business Location', locations], ['Total SKU', summary.products], ['Total Available Qty', summary.quantity],
    ...(permission.cost ? [['Current Stock Value (by purchase rate, Tk)', Math.round(summary.cost ?? 0)]] : []),
    ['Potential Sale Value (Tk)', Math.round(summary.sale)],
    ...(permission.profit ? [['Potential Profit Value (Tk)', Math.round(summary.profit ?? 0)]] : []),
    ['Total Sold Value (Tk)', Math.round(summary.sold)], ['Generated At', generatedAt],
  ];
  const table = [columns.map(column => column.header), ...values, ['TOTALS'], [], ['Summary'], ...summaryRows];
  const sheet = utils.aoa_to_sheet(table);
  sheet['!cols'] = columns.map(column => ({ wch: column.excelWidth }));
  sheet['!autofilter'] = { ref: `A1:${utils.encode_col(columns.length - 1)}${totalsIndex}` };
  sheet['!merges'] = [{ s: { r: totalsIndex + 2, c: 0 }, e: { r: totalsIndex + 2, c: 1 } }];
  columns.forEach((column, index) => {
    const letter = utils.encode_col(index);
    if (column.total) {
      sheet[utils.encode_cell({ r: totalsIndex, c: index })] = {
        t: 'n', v: values.reduce((sum, row) => sum + (typeof row[index] === 'number' ? Number(row[index]) : 0), 0),
        f: `SUM(${letter}2:${letter}${totalsIndex})`, z: '#,##0',
      };
    }
    if (!column.numeric) return;
    values.forEach((_, rowIndex) => {
      const item: CellObject | undefined = sheet[utils.encode_cell({ r: rowIndex + 1, c: index })];
      if (item?.t === 'n') item.z = '#,##0';
    });
  });
  const book = utils.book_new();
  utils.book_append_sheet(book, sheet, 'Stocks');
  return new Uint8Array(write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

type ReportPdf = jsPDF & { lastAutoTable?: { finalY: number } };
function signatures(doc: jsPDF, pageWidth: number, y: number, summary: boolean) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(summary ? 9 : 11);
  const start = pageWidth - (summary ? 80 : 120);
  doc.line(30, y, summary ? 80 : 120, y);
  doc.line(start, y, pageWidth - 30, y);
  doc.text('Received by', summary ? 40 : 55, y + 6);
  doc.text('Authorized by', start + (summary ? 10 : 25), y + 6);
}

export function stockPdf({ rows, summary, permission, locations, skuQuery, searchQuery, generatedAt }: StockExport, summaryReport: boolean) {
  const doc: ReportPdf = new jsPDF({ orientation: summaryReport ? 'portrait' : 'landscape', unit: 'mm', format: 'a4' });
  const { width, height } = doc.internal.pageSize;
  doc.setFontSize(16);
  doc.text('Griipbuddy', width / 2, 15, { align: 'center' });
  doc.setFontSize(13);
  doc.text(summaryReport ? 'Stock Summary Reports' : 'Stock Reports', width / 2, 25, { align: 'center' });
  doc.setFontSize(11);
  let y = 40;
  const intro = [
    'Business Location: ' + locations,
    ...(summaryReport && skuQuery ? ['SKU Filter: ' + skuQuery] : []),
    ...(summaryReport && searchQuery ? ['Search Filter: ' + searchQuery] : []),
    'Date: ' + generatedAt,
  ];
  for (const line of intro) {
    const lines: string[] = doc.splitTextToSize(line, width - 28);
    doc.text(lines, 14, y);
    y += 8 + (lines.length - 1) * 6;
  }
  const categories = summary.categories.map(item => `${item.name} (${item.quantity} qty)`).join(', ');
  const total = summaryReport ? 'Total Qty: ' + categories : `Total SKU: ${summary.products}${categories ? ', ' + categories : ''}`;
  const totalLines: string[] = doc.splitTextToSize(total, width - 28);
  doc.text(totalLines, 14, y);
  y += totalLines.length * 6 + 5;
  const columns = exportColumns(permission).filter(column => column.pdf);
  const content = summaryReport ? summary.subcategories.map(item => [
    item.name, displayQuantity(item.quantity), ...(permission.cost ? [stockCurrency(item.cost)] : []), stockCurrency(item.sale),
  ]) : rows.map(row => columns.map(column => {
    const value = column.get(row);
    return column.display && typeof value !== 'string' ? column.display(value) : value ?? '-';
  }));
  const summaryHeaders = ['Sub Category', 'Available Quantity', ...(permission.cost ? ['Purchase Value'] : []), 'Total Sale Value'];
  const widths = summaryReport
    ? summaryHeaders.map((_, index) => index === 0 ? (width - 28) * .4 : (width - 28) * .6 / (summaryHeaders.length - 1))
    : columns.map(column => column.pdfWidth);
  autoTable(doc, {
    startY: y, head: [summaryReport ? summaryHeaders : columns.map(column => column.pdf)], body: content,
    styles: { fontSize: summaryReport ? 10 : 8, cellPadding: summaryReport ? 3 : 2, overflow: 'linebreak' },
    headStyles: { fillColor: [0, 102, 204], textColor: [255, 255, 255], fontStyle: 'bold' },
    margin: { left: 14, right: 14 }, tableWidth: summaryReport ? width - 28 : 'wrap',
    columnStyles: Object.fromEntries(widths.map((cellWidth, index) => [index, { cellWidth }])),
  });
  y = (doc.lastAutoTable?.finalY ?? y) + (summaryReport ? 15 : 10);
  const figures = [
    ...(permission.cost ? ['Current Stock Value (by purchase rate): ' + stockCurrency(summary.cost)] : []),
    'Potential Sale Value (by sale price): ' + stockCurrency(summary.sale),
    ...(permission.profit ? ['Potential Profit Value: ' + stockCurrency(summary.profit)] : []),
    'Total Sold Value: ' + stockCurrency(summary.sold),
  ];
  if (y + 8 + figures.length * 7 > height - 16) { doc.addPage(); y = 20; }
  doc.setFont('helvetica', 'bold');
  doc.text('Summary:', 14, y);
  doc.setFont('helvetica', 'normal');
  for (const line of figures) doc.text(line, 14, y += 7);
  y += 20;
  if (y > height - 24) { doc.addPage(); y = 30; }
  signatures(doc, width, y, summaryReport);
  if (summaryReport) {
    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page++) {
      doc.setPage(page);
      doc.setFontSize(10);
      doc.text(`Page ${page} of ${pages}`, width / 2, height - 10, { align: 'center' });
    }
  }
  return new Uint8Array(doc.output('arraybuffer'));
}
