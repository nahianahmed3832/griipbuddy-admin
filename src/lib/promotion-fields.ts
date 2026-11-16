export const couponScopes = [
  ['categoryIds', 'Category IDs'], ['subcategoryIds', 'Subcategory IDs'], ['sub_subcategoryIds', 'Third level category IDs'],
  ['productIds', 'Product IDs'], ['variant', 'Variant IDs'], ['userIds', 'Customer IDs'],
] as const;
export const couponAmounts = [
  ['discountValue', 'Discount value'], ['maxDiscountAmount', 'Discount cap'], ['minOrderAmount', 'Minimum order amount'],
  ['usageLimit', 'Total usage limit'], ['usagePerUser', 'Usage limit per customer'],
] as const;
