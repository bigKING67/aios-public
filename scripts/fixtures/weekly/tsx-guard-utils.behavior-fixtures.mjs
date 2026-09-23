/**
 * Weekly TSX guard utility behavior guard.
 *
 * These parser helpers are shared by render-only weekly section guards. Keep
 * their JSX/type matching semantics explicit so guard migrations do not become
 * brittle source-snippet checks again.
 */

import {
  countCallExpressions,
  hasFunctionObjectParameterBinding,
  getFunctionParameterType,
  getInterfaceProperties,
  hasIdentifier,
  hasImportSource,
  hasLocalTypeDeclaration,
  hasObjectLiteralProperty,
  hasJsxAttribute,
  hasJsxElement,
  hasJsxElementWithAttribute,
  hasJsxElementWithExpressionChild,
  hasJsxElementWithSpread,
  hasNamedImport,
  hasPropertyAccessExpression,
  normalizeTypeText,
  parseTsxFile,
} from '../../lib/weekly/tsx-guard-utils.mjs';
import {
  withWeeklyTempTextFile,
} from '../../lib/weekly/behavior-assert-utils.mjs';

let activeAssertions;

function useAssertions(assertions) {
  activeAssertions = assertions;
}

function currentAssertions() {
  if (!activeAssertions) {
    throw new Error('weekly TSX guard utility behavior fixtures require guard assertions.');
  }
  return activeAssertions;
}

function assertDeepEqual(...args) {
  currentAssertions().assertDeepEqual(...args);
}

function assertEqual(...args) {
  currentAssertions().assertEqual(...args);
}

function assertFalse(...args) {
  currentAssertions().assertFalse(...args);
}

function assertTrue(...args) {
  currentAssertions().assertTrue(...args);
}

function buildFixtureSource() {
  return [
    'type ReactNode = unknown;',
    'type TableProps<RowType extends object> = { rows: RowType[] };',
    'type LocalAlias = string;',
    "import type { ExternalType } from './external-types';",
    "import { buildExampleProps as buildAliasedProps, keepName } from './example-adapter';",
    "import './side-effect-adapter';",
    '',
    'interface ExampleProps<RowType extends object> {',
    '  tableProps: TableProps<RowType>;',
    '  title: string;',
    '  optionalChild?: ReactNode;',
    '}',
    '',
    'export function ExampleSection<RowType extends object>({',
    '  tableProps,',
    '  title,',
    '  optionalChild,',
    '}: ExampleProps<RowType>) {',
    '  const localIdentifier = title;',
    '  const fakePropertyAccess = "report.kpis";',
    '  const reportMeta = report.meta;',
    '  buildAliasedProps();',
    '  buildAliasedProps();',
    '  const rawProps = { data, namedMethod() {} };',
    '  const shorthandObject = { optionalChild };',
    '  return (',
    '    <Wrapper>',
    '      <Header title={title} description="static description" data-state="ready" />',
    '      <DataTable<RowType> {...tableProps} />',
    '      <Summary>{localIdentifier}</Summary>',
    '      <EmptyState description="暂无数据" />',
    '      {optionalChild}',
    '    </Wrapper>',
    '  );',
    '}',
    '',
    'export function UntypedSection(props) {',
    '  return <Fallback {...props} />;',
    '}',
    '',
  ].join('\n');
}

function assertParseAndTypeHelpers(sourceText, sourceFile) {
  assertTrue(sourceText.includes('ExampleSection'), 'parseTsxFile should return the fixture source text');
  assertEqual(
    normalizeTypeText('  ExampleProps<\n  RowType\n>  '),
    'ExampleProps< RowType >',
    'normalizeTypeText should collapse whitespace without changing tokens',
  );

  assertDeepEqual(
    getInterfaceProperties(sourceFile, 'ExampleProps'),
    [
      { name: 'tableProps', type: 'TableProps<RowType>' },
      { name: 'title', type: 'string' },
      { name: 'optionalChild', type: 'ReactNode' },
    ],
    'getInterfaceProperties should return normalized interface property names and types',
  );
  assertEqual(
    getInterfaceProperties(sourceFile, 'MissingProps'),
    null,
    'getInterfaceProperties should return null for missing interfaces',
  );

  assertTrue(
    hasLocalTypeDeclaration(sourceFile, 'ExampleProps'),
    'hasLocalTypeDeclaration should match local interfaces',
  );
  assertTrue(
    hasLocalTypeDeclaration(sourceFile, 'LocalAlias'),
    'hasLocalTypeDeclaration should match local type aliases',
  );
  assertFalse(
    hasLocalTypeDeclaration(sourceFile, 'ExternalType'),
    'hasLocalTypeDeclaration should ignore non-local imported/ambient type names',
  );

  assertEqual(
    getFunctionParameterType(sourceFile, 'ExampleSection'),
    'ExampleProps<RowType>',
    'getFunctionParameterType should return the first typed parameter',
  );
  assertEqual(
    getFunctionParameterType(sourceFile, 'UntypedSection'),
    null,
    'getFunctionParameterType should return null for untyped parameters',
  );
  assertEqual(
    getFunctionParameterType(sourceFile, 'MissingSection'),
    null,
    'getFunctionParameterType should return null for missing functions',
  );

  assertTrue(
    hasFunctionObjectParameterBinding(sourceFile, 'ExampleSection', 'tableProps'),
    'hasFunctionObjectParameterBinding should match destructured function parameters',
  );
  assertFalse(
    hasFunctionObjectParameterBinding(sourceFile, 'ExampleSection', 'missingBinding'),
    'hasFunctionObjectParameterBinding should reject missing destructured parameters',
  );
  assertFalse(
    hasFunctionObjectParameterBinding(sourceFile, 'UntypedSection', 'props'),
    'hasFunctionObjectParameterBinding should reject non-object parameter bindings',
  );
}

function assertImportAndExpressionHelpers(sourceFile) {
  assertTrue(
    hasImportSource(sourceFile, './example-adapter'),
    'hasImportSource should match import module specifiers',
  );
  assertTrue(
    hasImportSource(sourceFile, 'side-effect-adapter'),
    'hasImportSource should match side-effect import module specifiers',
  );
  assertFalse(
    hasImportSource(sourceFile, './missing-adapter'),
    'hasImportSource should reject missing import module specifiers',
  );

  assertTrue(
    hasNamedImport(sourceFile, {
      sourceNeedle: './example-adapter',
      importedName: 'buildExampleProps',
      localName: 'buildAliasedProps',
    }),
    'hasNamedImport should match aliased named imports by imported and local names',
  );
  assertTrue(
    hasNamedImport(sourceFile, {
      sourceNeedle: './example-adapter',
      importedName: 'keepName',
      localName: 'keepName',
    }),
    'hasNamedImport should match unaliased named imports',
  );
  assertFalse(
    hasNamedImport(sourceFile, {
      sourceNeedle: './example-adapter',
      importedName: 'missingName',
    }),
    'hasNamedImport should reject missing named imports',
  );

  assertEqual(
    countCallExpressions(sourceFile, 'buildAliasedProps'),
    2,
    'countCallExpressions should count real call expressions',
  );
  assertEqual(
    countCallExpressions(sourceFile, 'missingCall'),
    0,
    'countCallExpressions should return zero for missing calls',
  );

  assertTrue(
    hasPropertyAccessExpression(sourceFile, 'report.meta'),
    'hasPropertyAccessExpression should match real property access expressions',
  );
  assertFalse(
    hasPropertyAccessExpression(sourceFile, 'report.kpis'),
    'hasPropertyAccessExpression should ignore string-literal lookalikes',
  );
}

function assertIdentifierAndJsxHelpers(sourceFile) {
  assertTrue(
    hasIdentifier(sourceFile, 'localIdentifier'),
    'hasIdentifier should find identifiers in function bodies',
  );
  assertFalse(
    hasIdentifier(sourceFile, 'missingIdentifier'),
    'hasIdentifier should return false for missing identifiers',
  );

  assertTrue(
    hasObjectLiteralProperty(sourceFile, 'data'),
    'hasObjectLiteralProperty should match object property assignments',
  );
  assertTrue(
    hasObjectLiteralProperty(sourceFile, 'namedMethod'),
    'hasObjectLiteralProperty should match object method declarations',
  );
  assertTrue(
    hasObjectLiteralProperty(sourceFile, 'optionalChild'),
    'hasObjectLiteralProperty should match shorthand object properties',
  );
  assertFalse(
    hasObjectLiteralProperty(sourceFile, 'missingProperty'),
    'hasObjectLiteralProperty should reject missing object properties',
  );

  assertTrue(
    hasJsxElement(sourceFile, 'Wrapper'),
    'hasJsxElement should match JSX elements',
  );
  assertTrue(
    hasJsxElement(sourceFile, 'EmptyState'),
    'hasJsxElement should match self-closing JSX elements',
  );
  assertFalse(
    hasJsxElement(sourceFile, 'MissingElement'),
    'hasJsxElement should reject missing JSX elements',
  );

  assertTrue(
    hasJsxElementWithExpressionChild(sourceFile, {
      tagName: 'Summary',
      expressionText: 'localIdentifier',
    }),
    'hasJsxElementWithExpressionChild should match direct JSX expression children',
  );
  assertFalse(
    hasJsxElementWithExpressionChild(sourceFile, {
      tagName: 'Summary',
      expressionText: 'optionalChild',
    }),
    'hasJsxElementWithExpressionChild should reject mismatched expression children',
  );

  assertTrue(
    hasJsxElementWithSpread(sourceFile, {
      tagName: 'DataTable',
      spreadName: 'tableProps',
      typeArguments: ['RowType'],
    }),
    'hasJsxElementWithSpread should match JSX generic type arguments and spread props',
  );
  assertFalse(
    hasJsxElementWithSpread(sourceFile, {
      tagName: 'DataTable',
      spreadName: 'tableProps',
      typeArguments: ['OtherRow'],
    }),
    'hasJsxElementWithSpread should reject mismatched JSX generic type arguments',
  );
  assertFalse(
    hasJsxElementWithSpread(sourceFile, {
      tagName: 'DataTable',
      spreadName: 'otherProps',
      typeArguments: ['RowType'],
    }),
    'hasJsxElementWithSpread should reject mismatched spread identifiers',
  );

  assertTrue(
    hasJsxElementWithAttribute(sourceFile, {
      tagName: 'Header',
      attributeName: 'title',
      expressionText: 'title',
    }),
    'hasJsxElementWithAttribute should match expression attributes',
  );
  assertTrue(
    hasJsxElementWithAttribute(sourceFile, {
      tagName: 'Header',
      attributeName: 'description',
      expressionText: 'static description',
    }),
    'hasJsxElementWithAttribute should match string literal attributes',
  );
  assertTrue(
    hasJsxElementWithAttribute(sourceFile, {
      tagName: 'Header',
      attributeName: 'data-state',
      expressionText: 'ready',
    }),
    'hasJsxElementWithAttribute should match hyphenated JSX attributes',
  );
  assertTrue(
    hasJsxElementWithAttribute(sourceFile, {
      tagName: 'EmptyState',
      attributeName: 'description',
    }),
    'hasJsxElementWithAttribute should allow existence-only attribute checks',
  );
  assertFalse(
    hasJsxElementWithAttribute(sourceFile, {
      tagName: 'Header',
      attributeName: 'description',
      expressionText: 'other description',
    }),
    'hasJsxElementWithAttribute should reject mismatched attribute values',
  );
  assertFalse(
    hasJsxElementWithAttribute(sourceFile, {
      tagName: 'Header',
      attributeName: 'missing',
    }),
    'hasJsxElementWithAttribute should reject missing attributes',
  );

  assertTrue(
    hasJsxAttribute(sourceFile, 'data-state'),
    'hasJsxAttribute should find hyphenated JSX attributes anywhere in the file',
  );
  assertFalse(
    hasJsxAttribute(sourceFile, 'missing-attribute'),
    'hasJsxAttribute should return false for missing attributes',
  );
}

export function runWeeklyTsxGuardUtilsBehaviorFixtures(assertions) {
  useAssertions(assertions);
  withWeeklyTempTextFile({
    tempPrefix: 'aios-weekly-tsx-guard-utils-',
    sourceText: buildFixtureSource(),
    callback: (fixturePath) => {
      const { sourceText, sourceFile } = parseTsxFile(fixturePath);

      assertParseAndTypeHelpers(sourceText, sourceFile);
      assertImportAndExpressionHelpers(sourceFile);
      assertIdentifierAndJsxHelpers(sourceFile);
    },
  });
}
