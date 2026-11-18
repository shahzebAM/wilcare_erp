import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Preserve the catalog code, including all handlers, request payloads,
// financial expressions, pagination, badges and data-bound JSX. Only CSS and
// the accessibility attributes added to the existing controls are excluded.
const baseline = {
  MasterInventory: 'a773043a026cae7d3584e81e541f0b289cf1bf6820f6e618ab1f330c6f978b04',
  CustomerModule: 'a72d82d658f827cf080b81683a0c30f5a45f21ecb708da1d5ffd862b596665c7',
};

for (const [name, expected] of Object.entries(baseline)) {
  test(`${name} responsive presentation preserves its business code and data-bound content`, () => {
    const source = readFileSync(new URL(`../src/modules/${name}.tsx`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
    const tree = ts.createSourceFile(`${name}.tsx`, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const transformed = ts.transform(tree, [context => {
      const visit = node => {
        if (ts.isImportDeclaration(node) && !node.importClause && node.moduleSpecifier.text === './catalog-customer-workspace.css') return undefined;
        if (ts.isJsxAttribute(node) && ['className', 'aria-label', 'role', 'tabIndex'].includes(node.name.getText(tree))) return undefined;
        return ts.visitEachChild(node, visit, context);
      };
      return node => ts.visitNode(node, visit);
    }]);
    try {
      const printed = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed }).printFile(transformed.transformed[0]).replace(/[ \t]+$/gm, '');
      assert.equal(createHash('sha256').update(printed).digest('hex'), expected);
    } finally { transformed.dispose(); }
  });
}
