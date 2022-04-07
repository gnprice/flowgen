import { compiler, beautify } from "..";
import "../test-matchers";

it("should handle dynamic imports", () => {
  const ts = `
type A = import('react');
type B = import('react').ComponentType<{}>;
type C = import('react').ReactNode;
type D = import('zlib').Zlib;
type Z = number;
`;
  const result = compiler.compileDefinitionString(ts, { quiet: true });
  expect(beautify(result)).toMatchSnapshot();
  expect(result).toBeValidFlowTypeDeclarations();
});
