import { compiler, beautify } from "..";
import "../test-matchers";

it("should handle `typeof`", () => {
  const ts = `
export const x: { o: { f(string): number } };
// export type Tx = typeof x;
// export type Txo = typeof x.o;
export type Txof = typeof x.o.f;
`;
  const result = compiler.compileDefinitionString(ts);
  expect(beautify(result)).toMatchSnapshot();
  expect(result).toBeValidFlowTypeDeclarations();
});
