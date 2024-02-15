import { SortOrder } from "../../util/SortOrder";

export type RecipeParameterOrderByInput = {
  active?: SortOrder;
  batch?: SortOrder;
  className?: SortOrder;
  createdAt?: SortOrder;
  createdBy?: SortOrder;
  editedAt?: SortOrder;
  editedBy?: SortOrder;
  id?: SortOrder;
  itemId?: SortOrder;
  recipeParamDescription?: SortOrder;
  recipeParamName?: SortOrder;
  recipeParamRevision?: SortOrder;
  recipeParamUnits?: SortOrder;
  recipeSetpointBooleanValue?: SortOrder;
  recipeSetpointLowerLimit?: SortOrder;
  recipeSetpointType?: SortOrder;
  recipeSetpointUpperLimit?: SortOrder;
  schemaVersion?: SortOrder;
  sequencerParameters?: SortOrder;
};
