import { compiler, beautify } from "..";
import "../test-matchers";

it("should handle dynamic imports", () => {
  const ts = `
// type A = import('react');  // TODO need to insert "typeof"
type B = import('react').ComponentType<{}>;
`;
  const result = compiler.compileDefinitionString(ts, { quiet: true });
  expect(beautify(result)).toMatchSnapshot();
  expect(result).toBeValidFlowTypeDeclarations();
});
