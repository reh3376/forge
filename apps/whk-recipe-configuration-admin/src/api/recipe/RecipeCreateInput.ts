export type RecipeCreateInput = {
  active?: boolean | null;
  createdBy: string;
  customerId: string;
  itemDescription?: string | null;
  itemId: string;
  mashBill?: string | null;
  revision?: number | null;
  schemaVersion?: string | null;
  updatedBy?: string | null;
};
