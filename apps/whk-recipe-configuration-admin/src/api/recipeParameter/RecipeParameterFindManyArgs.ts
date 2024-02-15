import { RecipeParameterWhereInput } from "./RecipeParameterWhereInput";
import { RecipeParameterOrderByInput } from "./RecipeParameterOrderByInput";

export type RecipeParameterFindManyArgs = {
  where?: RecipeParameterWhereInput;
  orderBy?: Array<RecipeParameterOrderByInput>;
  skip?: number;
  take?: number;
};
