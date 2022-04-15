import { compiler, beautify } from "..";
import "../test-matchers";

test("rewrite idiosyncrasies of the react-native TS definitions", () => {
  const ts = `
import * as ReactNative from 'react-native';
type A = ReactNative.Constructor<number>;
`;
  const result = compiler.compileDefinitionString(ts, { quiet: true });
  expect(beautify(result)).toMatchSnapshot();
  //   expect(result).toBeValidFlowTypeDeclarations();
});
