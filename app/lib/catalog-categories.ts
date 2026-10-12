export const collegeCatalogCategories = [
  "existing-curated",
  "csu-campus",
  "major-public",
  "regional-public",
  "private-nonprofit",
  "federal-public",
  "federal-nonprofit",
  "federal-for-profit",
] as const;

export type CollegeCatalogCategory = (typeof collegeCatalogCategories)[number];
