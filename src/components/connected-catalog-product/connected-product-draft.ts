import type { ProductWorkspaceProduct } from "./contracts";
import { variantOptionSignature } from "./option-signature";

export type AttributeValue = string | number | boolean;
export type AttributeValues = Record<string, AttributeValue>;
export type DraftOption = { id: string; key: string; label: string; values: { id: string; value: string; label: string }[] };
export type DraftVariant = { id: string; sku: string; active: boolean; selections: Record<string, string>; attributeValues: AttributeValues };
export type ProductDraft = {
  id: string;
  revision: number | null;
  slug: string;
  name: string;
  brand: string;
  description: string;
  shortDescription: string;
  featured: boolean;
  newArrival: boolean;
  publication: "DRAFT" | "ACTIVE" | "ARCHIVED";
  primaryCategoryId: string;
  secondaryCategoryIds: string[];
  specifications: { key: string; label: string; value: string }[];
  attributeValues: AttributeValues;
  options: DraftOption[];
  variants: DraftVariant[];
  issuedVariantIds: string[];
  defaultVariantId: string;
};

function attributeValues(raw: unknown): AttributeValues {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter((entry): entry is [string, AttributeValue] =>
    typeof entry[1] === "string" || typeof entry[1] === "number" || typeof entry[1] === "boolean"));
}

function specifications(raw: unknown): ProductDraft["specifications"] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item, index) => item && typeof item === "object" &&
    typeof item.label === "string" && typeof item.value === "string"
    ? [{ key: `spec-${index}`, label: item.label, value: item.value }] : []);
}

export function draftProduct(product: ProductWorkspaceProduct | null): ProductDraft {
  return {
    id: product?.id ?? "",
    revision: product?.revision ?? null,
    slug: product?.slug ?? "",
    name: product?.name ?? "",
    brand: product?.brand ?? "",
    description: product?.description ?? "",
    shortDescription: product?.shortDescription ?? "",
    featured: product?.featured ?? false,
    newArrival: product?.newArrival ?? false,
    publication: product?.publication ?? "DRAFT",
    primaryCategoryId: product?.departmentId ?? "",
    secondaryCategoryIds: product?.secondaryCategories.map(row => row.departmentId) ?? [],
    specifications: specifications(product?.specifications),
    attributeValues: attributeValues(product?.attributeValues),
    options: product?.optionDefinitions.map(option => ({
      id: option.id, key: option.key, label: option.label,
      values: option.values.map(({ id, value, label }) => ({ id, value, label })),
    })) ?? [],
    variants: product?.variants.map(variant => ({
      id: variant.id, sku: variant.sku, active: variant.active && !variant.archivedAt,
      selections: Object.fromEntries(variant.optionSelections.map(({ optionId, optionValueId }) => [optionId, optionValueId])),
      attributeValues: attributeValues(variant.attributeValues),
    })) ?? [],
    issuedVariantIds: product?.variants.map(({ id }) => id) ?? [],
    defaultVariantId: product?.variants.find(row => row.isDefault)?.id ?? "",
  };
}

export const maxDraftVariants = 40;
const maxProposalCount = 100;

export function proposalCombinations(options: readonly DraftOption[], variants: readonly DraftVariant[]) {
  const count = options.reduce((total, { values }) => total * values.length, 1);
  if (count > maxProposalCount) return null;
  const existing = new Set(variants.map(({ selections }) => variantOptionSignature(selections)));
  const proposals = options.reduce<Record<string, string>[]>((combinations, option) =>
    combinations.flatMap(combination => option.values.map(({ id }) => ({ ...combination, [option.id]: id }))), [{}]);
  return proposals.filter(proposal => !existing.has(variantOptionSignature(proposal)));
}

export function variantTuple(options: readonly DraftOption[], selections: Record<string, string>) {
  return options.map(option => {
    const value = option.values.find(row => row.id === selections[option.id]);
    return value?.label || value?.value || "Choose a value";
  }).join(" / ") || "Standard";
}

export const foldedSku = (sku: string) => sku.trim().toUpperCase();
export const validDraftSku = (sku: string) => /^[A-Z0-9][A-Z0-9._ &+\-]{0,59}$/.test(foldedSku(sku));

export function suggestVariantSku(
  slug: string, options: readonly DraftOption[], selections: Record<string, string>, reserved: Set<string>,
): string {
  const token = (value: string) => value.normalize("NFKD").replace(/\p{Mark}/gu, "").toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  const prefix = token(slug);
  if (!prefix) return "";
  const order = [...options].sort((left, right) => left.key.localeCompare(right.key));
  const suffixes = order.map(option => token(option.values.find(row => row.id === selections[option.id])?.value ?? ""));
  const base = [suffixes.some(Boolean) ? prefix.slice(0, 32).replace(/-$/, "") : prefix, ...suffixes].filter(Boolean).join("-");
  let candidate = base.slice(0, 60).replace(/-$/, "");
  for (let index = 2; reserved.has(candidate); index++) {
    const suffix = "-" + index;
    candidate = base.slice(0, 60 - suffix.length).replace(/-$/, "") + suffix;
  }
  return candidate;
}

export function variantDraftIssues(draft: ProductDraft) {
  const issues: string[] = [];
  const skuErrors = new Map<string, string>();
  const fold = (value: string) => value.trim().normalize("NFKC").toLowerCase();
  const optionKeys = new Set<string>();
  for (const option of draft.options) {
    const name = option.label.trim() || option.key.trim() || "An option";
    const key = fold(option.key);
    if (!key || !option.label.trim() || !option.values.length) {
      issues.push(name + " needs a key, label and at least one value.");
    } else if (optionKeys.has(key)) {
      issues.push(name + " uses an option key that already exists.");
    }
    optionKeys.add(key);
    const values = option.values.map(row => fold(row.value));
    const labels = option.values.map(row => fold(row.label) || fold(row.value));
    if (values.some(value => !value) || new Set(values).size !== values.length || new Set(labels).size !== labels.length) {
      issues.push(name + " needs distinct canonical values and display labels.");
    }
  }
  const skus = new Set<string>();
  const combinations = new Set<string>();
  for (const row of draft.variants) {
    const sku = foldedSku(row.sku);
    const tuple = variantTuple(draft.options, row.selections);
    const signature = variantOptionSignature(row.selections);
    const skuError = !validDraftSku(sku) ? tuple + " needs a valid SKU of up to 60 characters."
      : skus.has(sku) ? sku + " is used in more than one variant." : null;
    if (skuError) {
      issues.push(skuError);
      skuErrors.set(row.id, skuError);
    }
    if (Object.keys(row.selections).length !== draft.options.length || !draft.options.every(option =>
      option.values.some(value => value.id === row.selections[option.id]))) {
      issues.push((sku || tuple) + " needs one value from every option.");
    } else if (combinations.has(signature)) issues.push(tuple + " is used in more than one variant.");
    skus.add(sku);
    combinations.add(signature);
  }
  return { issues: [...new Set(issues)], skuErrors };
}

export function withAttribute(values: AttributeValues, key: string, value: AttributeValue | undefined) {
  const next = { ...values };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

export function normalizeVariantDraft(draft: ProductDraft, variants: DraftVariant[]) {
  const defaultVariantId = variants.some(row => row.id === draft.defaultVariantId && row.active)
    ? draft.defaultVariantId : variants.find(row => row.active)?.id ?? "";
  return { ...draft, variants, defaultVariantId };
}
