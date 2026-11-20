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
