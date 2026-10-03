/** Read-only inventory. Run from repository root: node tools/web-api-inventory.cjs.
 * Static path references are discovery evidence, not runtime or permission coverage.
 */
const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
function files(dir, extension) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? files(path.join(dir, entry.name), extension)
        : extension.test(entry.name)
          ? [path.join(dir, entry.name)]
          : [],
    );
}
function visit(node, callback) {
  callback(node);
  ts.forEachChild(node, (child) => visit(child, callback));
}
function decorators(node) {
  return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
}
function literalPaths(node) {
  if (!node) return [''];
  if (ts.isStringLiteral(node)) return [node.text];
  if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap(literalPaths);
  throw new Error(`Unsupported route expression: ${node.getText()}`);
}
const routes = [];
for (const file of files('apps/api/src', /\.controller\.ts$/)) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  visit(source, (node) => {
    if (!ts.isClassDeclaration(node)) return;
    const controller = decorators(node).find(
      (d) =>
        ts.isCallExpression(d.expression) &&
        d.expression.expression.getText(source) === 'Controller',
    );
    if (!controller) return;
    const bases = literalPaths(controller.expression.arguments[0]);
    for (const member of node.members)
      for (const decorator of decorators(member)) {
        const call = decorator.expression;
        if (!ts.isCallExpression(call)) continue;
        const method = call.expression.getText(source).toUpperCase();
        if (!['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) continue;
        const suffixes = literalPaths(call.arguments[0]);
        const alternatives = bases.flatMap((base) =>
          suffixes.map((suffix) => '/' + [base, suffix].filter(Boolean).join('/')),
        );
        for (const routePath of alternatives)
          routes.push({
            method,
            path: routePath,
            controller: file,
            handler: member.name.getText(source),
            alternatives,
          });
      }
  });
}
const candidates = [];
for (const file of files('apps/web/src', /\.tsx?$/).filter((file) => !file.includes('.test.'))) {
  const code = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
  const declarations = [];
  const scope = (node) => {
    let current = node.parent;
    while (current && !ts.isFunctionLike(current) && !ts.isSourceFile(current))
      current = current.parent;
    return current;
  };
  visit(source, (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer)
      declarations.push({
        name: node.name.text,
        initializer: node.initializer,
        scope: scope(node),
      });
  });
  const ancestors = (node) => {
    const result = [];
    let current = node;
    while (current) {
      result.push(current);
      current = current.parent;
    }
    return result;
  };
  function evaluate(node, seen = new Set()) {
    if (!node) return '';
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isIdentifier(node)) {
      if (seen.has(node.text)) return ':' + node.text;
      const parents = ancestors(node);
      const binding = declarations
        .filter((item) => item.name === node.text && parents.includes(item.scope))
        .sort((a, b) => parents.indexOf(a.scope) - parents.indexOf(b.scope))[0];
      const next = new Set(seen);
      next.add(node.text);
      return binding ? evaluate(binding.initializer, next) : ':' + node.text;
    }
    if (ts.isTemplateExpression(node))
      return (
        node.head.text +
        node.templateSpans
          .map((span) => evaluate(span.expression, seen) + span.literal.text)
          .join('')
      );
    if (ts.isPropertyAccessExpression(node)) return ':' + node.name.text;
    return ':parameter';
  }
  visit(source, (node) => {
    if (
      !ts.isStringLiteral(node) &&
      !ts.isNoSubstitutionTemplateLiteral(node) &&
      !ts.isTemplateExpression(node)
    )
      return;
    let value = evaluate(node)
      .split('?')[0]
      .replace(/^:parameter\//, '/');
    if (file.endsWith('dashboard-api.ts') && value.startsWith('/') && !value.startsWith('/me'))
      value = '/organizations/:organizationId' + value;
    if (value.startsWith('/')) candidates.push({ path: value, file, code });
  });
}
function matches(route, candidate) {
  const expected = route.path.split('/'),
    actual = candidate.path.split('/');
  return (
    expected.length === actual.length &&
    expected.every(
      (segment, index) =>
        segment === actual[index] ||
        segment.startsWith(':') ||
        (actual[index].startsWith(':') &&
          (candidate.code.includes("'" + segment + "'") ||
            candidate.code.includes('"' + segment + '"'))),
    )
  );
}
const legacyAliases = {
  'POST /pilot-support-cases': '/organizations/:organizationId/support-cases',
  'PATCH /pilot-support-cases/:caseId': '/organizations/:organizationId/support-cases/:caseId',
  'POST /pilot-support-cases/:caseId/resolve':
    '/organizations/:organizationId/support-cases/:caseId/resolve',
  'POST /pilot-farmer-imports/:importId/confirm-upload':
    '/pilots/:pilotId/farmer-imports/:importId/validate',
  'POST /pilot-farmer-imports/:importId/confirm':
    '/pilots/:pilotId/farmer-imports/:importId/confirm',
};
const integrations = {
  'POST /auth/device/token':
    'Device client credential exchange; returns device refresh credentials rather than browser cookies. Used by device integrations, not the staff browser session.',
};
const gaps = {
  'POST /operations/privacy-requests':
    'Backend contract gap: strict subject and request schemas intersect and reject each other’s keys. Existing requests and farmer self-service creation work.',
  'POST /pilots/:pilotId/baselines':
    'Backend contract gap: the strict metric schema rejects measurement period and source fields from the intersection. Existing baseline records and review remain available.',
};
const entries = routes.map((route) => {
  const references = [
    ...new Set(
      candidates
        .filter((candidate) => matches(route, candidate))
        .map((candidate) => candidate.file),
    ),
  ];
  const key = route.method + ' ' + route.path;
  const alternative =
    legacyAliases[key] ??
    route.alternatives.find(
      (alternative) =>
        alternative !== route.path &&
        candidates.some((candidate) => matches({ ...route, path: alternative }, candidate)),
    );
  return {
    ...route,
    references,
    classification: gaps[key]
      ? 'backend gap'
      : integrations[key]
        ? 'device integration'
        : references.length
          ? 'path reference'
          : alternative
            ? 'alternate route'
            : 'review',
    note:
      gaps[key] ??
      integrations[key] ??
      (alternative ? `Equivalent handler is referenced through ${alternative}` : ''),
  };
});
const totals = Object.fromEntries(
  ['path reference', 'alternate route', 'device integration', 'backend gap', 'review'].map(
    (classification) => [
      classification,
      entries.filter((entry) => entry.classification === classification).length,
    ],
  ),
);
const text = `# Web API route inventory\n\nGenerated with \`node tools/web-api-inventory.cjs\`. All ${entries.length} controller route variants are listed, including aliases.\n\n${Object.entries(
  totals,
)
  .map(([key, value]) => `- ${key}: ${value}`)
  .join(
    '\n',
  )}\n\nThis is a static **path-reference inventory**, not an assertion of complete runtime coverage. It resolves local template bindings, includes shared request helpers, and identifies equivalent controller aliases. It does not prove the HTTP method, action eligibility, permission matrix, or successful production execution. Dynamic helper calls may require manual review. No API mutations are executed by this script.\n\nDevice credentials belong to external device integrations. Alternate route aliases share a handler; the browser uses one canonical route. Backend gaps are surfaced as honest UI states rather than sending invalid requests.\n\n| Method | Backend route | Classification | Candidate UI consumers / note |\n| --- | --- | --- | --- |\n${entries.map((entry) => `| ${entry.method} | \`${entry.path}\` | ${entry.classification} | ${entry.note || entry.references.map((file) => `[${file}](../../${file})`).join(', ') || `Review dynamic helper or add workflow: [${entry.handler}](../../${entry.controller})`} |`).join('\n')}\n`;
fs.writeFileSync('docs/ui/api-route-inventory.md', text);
console.log(JSON.stringify({ routeVariants: entries.length, ...totals }));
for (const entry of entries.filter((entry) => entry.classification === 'review'))
  console.log(entry.method, entry.path);
