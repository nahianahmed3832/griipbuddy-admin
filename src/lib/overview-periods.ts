export const overviewPresets = [
  ['today', 'Today'], ['yesterday', 'Yesterday'], ['last7', 'Last 7 days'], ['last30', 'Last 30 days'],
  ['thisMonth', 'This month'], ['lastMonth', 'Last month'], ['thisQuarter', 'This quarter'],
  ['thisFiscalYear', 'This fiscal year (Jul–Jun)'], ['custom', 'Custom range'],
] as const;

export function overviewPreset(value: string) {
  return value === '7' ? 'last7' : value === '30' ? 'last30' : value;
}
