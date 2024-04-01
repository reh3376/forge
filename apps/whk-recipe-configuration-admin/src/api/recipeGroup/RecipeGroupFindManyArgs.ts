import { RecipeGroupWhereInput } from "./RecipeGroupWhereInput";
import { RecipeGroupOrderByInput } from "./RecipeGroupOrderByInput";

export type RecipeGroupFindManyArgs = {
  where?: RecipeGroupWhereInput;
  orderBy?: Array<RecipeGroupOrderByInput>;
  skip?: number;
  take?: number;
};
