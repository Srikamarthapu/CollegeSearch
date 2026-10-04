export const collegeCatalogCategories = [
  "existing-curated",
  "csu-campus",
  "major-public",
  "regional-public",
  "private-nonprofit",
] as const;

export type CollegeCatalogCategory = (typeof collegeCatalogCategories)[number];
