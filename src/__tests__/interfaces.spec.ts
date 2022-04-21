import { compiler, beautify } from "..";
import "../test-matchers";

/* eslint jest/expect-expect: ["error", { "assertFunctionNames": ["expect", "check"] }] */
const check = (ts, options?, expectFlowValid?) => {
  const result = compiler.compileDefinitionString(ts, options);
  expect(beautify(result)).toMatchSnapshot();
  if (expectFlowValid ?? true) expect(result).toBeValidFlowTypeDeclarations();
  else expect(result).not.toBeValidFlowTypeDeclarations();
};

it("should handle single interface", () => {
  const ts = `
interface User {
  firstName: string
}
`;
  check(ts);
  check(ts, { interfaceRecords: true });
});

it("should handle interface inheritance", () => {
  const ts = `
interface User {
  firstName: string
}
interface SpecialUser extends User {
  nice: number
}
`;
  check(ts);
  check(ts, { interfaceRecords: true });
  check(ts, { interfaceRecords: true, inexact: false });
});

it("should handle interface merging", () => {
  const ts = `
interface User {
  firstName: string
}
interface User {
  lastName: string
}
interface User {
  username: string
}
`;
  check(ts);
  check(ts, { interfaceRecords: true });
});

it("should handle all properties", () => {
  const ts = `
interface Props {
  "aria-label": string;
  "aria-labelledby"?: number;
  color: string;
  [key: string]: string;
}
`;
  check(ts, undefined, false); // unsupported-syntax
});

it("should support readonly modifier", () => {
  const ts = `
interface Helper {
  readonly name: string;
  readonly callback(): void;
}
`;
  check(ts);
});

it("should support call signature", () => {
  const ts = `
  interface ObjectSchema<T> {}
  interface ObjectSchemaDefinition<T> {}
  declare interface ObjectSchemaConstructor {
    <T extends object>(fields?: ObjectSchemaDefinition<T>): ObjectSchema<T>;
    new (): ObjectSchema<{}>;
  }
`;
  check(ts);
});

it("should remove this in call signature", () => {
  const ts = `
interface Arc<This, Datum> {
  (this: This, d: Datum, ...args: any[]): string | null;
}
  
interface D<This, Datum> {
  new (this: This, d: Datum, ...args: any[]);
}
  
interface C<This, Datum> {
  (this: This, d: Datum, ...args: any[]);
}
`;
  check(ts);
});

it("should remove generic defaults in call signature", () => {
  const ts = `
interface AbstractLevelDOWN<K, V> {}
interface AbstractLevelDOWNConstructor {
    <K = any, V = any>(location: string): AbstractLevelDOWN<K, V>;
}  
`;
  check(ts);
});

it("should support omitting generic defaults in types, classes, interfaces", () => {
  const ts = `
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
`;
  check(ts);
});

it("should support optional methods", () => {
  const ts = `
interface Example<State> {
  required<R>(value: any, state: State): true;
  optional?<R>(value: any, state: State): false;
}
`;
  check(ts);
});

it("should handle toString property name", () => {
  const ts = `
interface A {
  toString(): string;
}
`;
  check(ts);
});

it("should handle untyped object binding pattern", () => {
  const ts = `
interface ObjectBinding {
  (): void;
  ({}): void;
  ({ a, b }): void;
}
`;
  check(ts);
});

it("should handle untyped array binding pattern", () => {
  const ts = `
interface ArrayBinding {
  (): void;
  ([]): void;
  ([ a, b ]): void;
}
`;
  check(ts);
});

it("should handle typed object binding pattern", () => {
  const ts = `
interface ObjectBinding {
  (): void;
  ({}: any): void;
  ({ a, b }: { a: string, b: number }): void;
}
`;
  check(ts);
});

it("should handle typed array binding pattern", () => {
  const ts = `
interface ArrayBinding {
  (): void;
  ([]: []): void;
  ([ a, b ]: [string, number]): void;
}
`;
  check(ts);
});

it("should handle mutli-extends pattern", () => {
  const ts = `
interface Shape {
  color: string;
}

interface PenStroke {
  penWidth: number;
}
interface Square extends Shape, PenStroke {
  sideLength: number;
}
`;
  check(ts);
});
