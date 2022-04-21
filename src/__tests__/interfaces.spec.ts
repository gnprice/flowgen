import { compiler, beautify } from "..";
import "../test-matchers";

const builder = new compiler.ProgramsBuilder();

/* eslint jest/expect-expect: ["error", { "assertFunctionNames": ["expect", "registerTest"] }] */
function registerTest(ts: string, options) {
  const { expectFlowValid = true, ...compilerOptions } = options ?? {};
  const fileName = builder.add(ts, compilerOptions);
  return () => {
    const result = compiler.compileHandle(builder, fileName);
    expect(beautify(result)).toMatchSnapshot();
    if (expectFlowValid) expect(result).toBeValidFlowTypeDeclarations();
    else expect(result).not.toBeValidFlowTypeDeclarations();
  };
}

/* eslint-disable jest/valid-title */
function testCompile(description: string, ts, options = [{}]) {
  if (options.length > 1) {
    describe(description, () => {
      for (const opts of options) {
        test(JSON.stringify(opts), registerTest(ts, opts));
      }
    });
  } else {
    const opts = options[0];
    const optionsDescription = Object.keys(opts).length
      ? " " + JSON.stringify(opts)
      : "";
    test(`${description}${optionsDescription}`, registerTest(ts, opts));
  }
}

testCompile(
  "should handle single interface",
  `
interface User {
  firstName: string
}
`,
  [{}, { interfaceRecords: true }],
);

testCompile(
  "should handle interface inheritance",
  `
interface User {
  firstName: string
}
interface SpecialUser extends User {
  nice: number
}
`,
  [{}, { interfaceRecords: true }, { interfaceRecords: true, inexact: false }],
);

testCompile(
  "should handle interface merging",
  `
interface User {
  firstName: string
}
interface User {
  lastName: string
}
interface User {
  username: string
}
`,
  [{}, { interfaceRecords: true }],
);

testCompile(
  "should handle all properties",
  `
interface Props {
  "aria-label": string;
  "aria-labelledby"?: number;
  color: string;
  [key: string]: string;
}
`,
  [
    { expectFlowValid: false }, // unsupported-syntax
  ],
);

testCompile(
  "should support readonly modifier",
  `
interface Helper {
  readonly name: string;
  readonly callback(): void;
}
`,
);

testCompile(
  "should support call signature",
  `
  interface ObjectSchema<T> {}
  interface ObjectSchemaDefinition<T> {}
  declare interface ObjectSchemaConstructor {
    <T extends object>(fields?: ObjectSchemaDefinition<T>): ObjectSchema<T>;
    new (): ObjectSchema<{}>;
  }
`,
);

testCompile(
  "should remove this in call signature",
  `
interface Arc<This, Datum> {
  (this: This, d: Datum, ...args: any[]): string | null;
}
  
interface D<This, Datum> {
  new (this: This, d: Datum, ...args: any[]);
}
  
interface C<This, Datum> {
  (this: This, d: Datum, ...args: any[]);
}
`,
);

testCompile(
  "should remove generic defaults in call signature",
  `
interface AbstractLevelDOWN<K, V> {}
interface AbstractLevelDOWNConstructor {
    <K = any, V = any>(location: string): AbstractLevelDOWN<K, V>;
}  
`,
);

testCompile(
  "should support omitting generic defaults in types, classes, interfaces",
  `
interface Foo<T = symbol, U = number> {}
interface FooBar extends Foo {}
type Bar<T = number, U = string> = {}
class Baz<T = string, U = number> {}

declare var a: Foo
declare var b: Bar
declare var c: Baz

declare var d: Foo<any>
declare var e: Bar<any>
declare var f: Baz<any>
`,
);

testCompile(
  "should support optional methods",
  `
interface Example<State> {
  required<R>(value: any, state: State): true;
  optional?<R>(value: any, state: State): false;
}
`,
);

testCompile(
  "should handle toString property name",
  `
interface A {
  toString(): string;
}
`,
);

testCompile(
  "should handle untyped object binding pattern",
  `
interface ObjectBinding {
  (): void;
  ({}): void;
  ({ a, b }): void;
}
`,
);

testCompile(
  "should handle untyped array binding pattern",
  `
interface ArrayBinding {
  (): void;
  ([]): void;
  ([ a, b ]): void;
}
`,
);

testCompile(
  "should handle typed object binding pattern",
  `
interface ObjectBinding {
  (): void;
  ({}: any): void;
  ({ a, b }: { a: string, b: number }): void;
}
`,
);

testCompile(
  "should handle typed array binding pattern",
  `
interface ArrayBinding {
  (): void;
  ([]: []): void;
  ([ a, b ]: [string, number]): void;
}
`,
);

testCompile(
  "should handle mutli-extends pattern",
  `
interface Shape {
  color: string;
}

interface PenStroke {
  penWidth: number;
}
interface Square extends Shape, PenStroke {
  sideLength: number;
}
`,
);
