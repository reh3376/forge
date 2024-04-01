import { StringFilter } from "../../util/StringFilter";
import { RecipeListRelationFilter } from "../recipe/RecipeListRelationFilter";
import { IntNullableFilter } from "../../util/IntNullableFilter";
import { StringNullableFilter } from "../../util/StringNullableFilter";

export type RecipeGroupWhereInput = {
  createdBy?: StringFilter;
  id?: StringFilter;
  recipe?: StringFilter;
  recipes?: RecipeListRelationFilter;
  revision?: IntNullableFilter;
  schemaVersion?: StringNullableFilter;
  updatedBy?: StringNullableFilter;
};
