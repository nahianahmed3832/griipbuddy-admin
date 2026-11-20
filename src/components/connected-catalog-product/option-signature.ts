export const maxProductOptions = 8;

export function variantOptionSignature(selections: Readonly<Record<string, string>>) {
  return JSON.stringify(Object.keys(selections).sort().map(optionId => [optionId, selections[optionId]]));
}
