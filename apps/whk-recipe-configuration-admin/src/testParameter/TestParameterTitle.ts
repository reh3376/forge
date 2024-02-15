import { TestParameter as TTestParameter } from "../api/testParameter/TestParameter";

export const TESTPARAMETER_TITLE_FIELD = "className";

export const TestParameterTitle = (record: TTestParameter): string => {
  return record.className?.toString() || String(record.id);
};
