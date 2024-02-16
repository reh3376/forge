import { TestParameter as TTestParameter } from "../api/testParameter/TestParameter";

export const TESTPARAMETER_TITLE_FIELD = "name";

export const TestParameterTitle = (record: TTestParameter): string => {
  return record.name?.toString() || String(record.id);
};
