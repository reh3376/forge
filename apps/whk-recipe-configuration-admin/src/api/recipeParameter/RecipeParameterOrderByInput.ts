import { SortOrder } from "../../util/SortOrder";

export type RecipeParameterOrderByInput = {
  active?: SortOrder;
  batch?: SortOrder;
  classIdId?: SortOrder;
  className?: SortOrder;
  createdAt?: SortOrder;
  createdBy?: SortOrder;
  editedAt?: SortOrder;
  editedBy?: SortOrder;
  id?: SortOrder;
  isClassDefinition?: SortOrder;
  itemId?: SortOrder;
  recipeParamDescription?: SortOrder;
  recipeParamName?: SortOrder;
  recipeParamUnits?: SortOrder;
  recipeSetpointBooleanValue?: SortOrder;
  recipeSetpointLowerLimit?: SortOrder;
  recipeSetpointType?: SortOrder;
  recipeSetpointUpperLimit?: SortOrder;
  revision?: SortOrder;
  schemaVersion?: SortOrder;
  sequencerParameters?: SortOrder;
};
