const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const { build } = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const { createRoot } = require('react-dom/client');
const ts = require('typescript');

test('Firebase reads are limited to four, and the next page uses the last snapshot', async () => {
  const path = 'src/lib/firebase.ts';
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const declarations = source.statements.filter(statement =>
    statement.getText(source).startsWith('export const ADMIN_DRIVERS_PAGE_SIZE') ||
    (ts.isFunctionDeclaration(statement) && statement.name?.text === 'fetchAdminDriversPage')
  );
  const code = ts.transpileModule(declarations.map(statement => statement.getText(source)).join('\n'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const docs = Array.from({ length: 4 }, (_, index) => ({ id: String(index), data: () => ({ id: 'legacy-id' }) }));
  const requests = [];
  const mocks = {
    db: {}, collection: (_, name) => name, documentId: () => '__name__',
    orderBy: (field, direction) => ({ field, direction }), startAfter: cursor => ({ cursor }),
    limit: count => ({ count }), query: (...constraints) => constraints,
    getDocsFromServer: async requested => {
      requests.push(requested);
      const results = requests.length === 1 ? docs : docs.slice(0, 2);
      return { docs: results, size: results.length };
    }
  };
  const exported = {};
  new Function('exports', ...Object.keys(mocks), code)(exported, ...Object.values(mocks));
  const first = await exported.fetchAdminDriversPage();
  assert.equal(first.hasMore, true);
  assert.deepEqual(first.drivers.map(driver => driver.id), ['0', '1', '2', '3']);
  const second = await exported.fetchAdminDriversPage(first.cursor);
  assert.equal(second.hasMore, false);
  assert.deepEqual(requests[0], ['drivers', { field: 'createdAt', direction: 'desc' }, { field: '__name__', direction: 'desc' }, { count: 4 }]);
  assert.deepEqual(requests[1], [...requests[0].slice(0, -1), { cursor: docs[3] }, { count: 4 }]);
});

test('driver cards appear in batches without waiting for statistics or loading the full roster', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/admin?tab=drivers' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const requests = [], tokenRequests = [], statsRequests = [];
  const drivers = Array.from({ length: 8 }, (_, index) => ({ id: `driver-${index + 1}`, firstName: 'Repartidor', lastName: String(index + 1), status: 'pending' }));
  let completePage, failPage, fullRosterReads = 0;
  globalThis.adminDriversTest = {
    ADMIN_DRIVERS_PAGE_SIZE: 4,
    fetchAdminDriversPage: cursor => {
      requests.push(cursor);
      return new Promise((resolve, reject) => { completePage = resolve; failPage = reject; });
    },
    fetchAllDrivers: async () => { fullRosterReads++; return drivers; },
    updateDriverStatus: async (_, status) => ({ status }),
    deleteDriverAccount: async () => {},
    fetchDriverPerformance: id => { statsRequests.push(id); return new Promise(() => {}); },
    fetchDriverFCMTokens: async ids => { tokenRequests.push(ids); return []; },
  };
  const mocks = {
    '../lib/firebase': 'ADMIN_DRIVERS_PAGE_SIZE, fetchAdminDriversPage, fetchAllDrivers, updateDriverStatus, deleteDriverAccount',
    '../lib/driverPerformanceData': 'fetchDriverPerformance',
    '../lib/fcmNotifications': 'fetchDriverFCMTokens',
    '../lib/whatsappDriverNotifications': '',
    './AdminDriversMap': '',
  };
  const { outputFiles } = await build({
    entryPoints: ['src/components/AdminDriversManager.tsx'], bundle: true, write: false, platform: 'node', format: 'cjs',
    jsx: 'automatic', external: ['react', 'react/jsx-runtime', 'lucide-react'], plugins: [{ name: 'mock-driver-data', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: 'mock-drivers' } : null);
      builder.onLoad({ filter: /.*/, namespace: 'mock-drivers' }, args => ({ contents:
        `${mocks[args.path] ? `export const { ${mocks[args.path]} } = globalThis.adminDriversTest;` : ''}
        export const deleteDriverFCMToken = async () => {}, sendAdminPushToDriver = async () => ({});
        export const buildDriverWelcomeWhatsAppMessage = () => '', buildDriverWhatsAppUrl = () => '';
        export default function Map() { return null; }`
      }));
    } }]
  });
  const moduleObject = { exports: {} };
  new Function('require', 'module', 'exports', outputFiles[0].text)(require, moduleObject, moduleObject.exports);
  const root = createRoot(dom.window.document.getElementById('root'));
  const { act } = React;
  const cards = () => [...document.querySelectorAll('h3')].filter(heading => heading.textContent.startsWith('Repartidor '));
  const click = label => [...document.querySelectorAll('button')].find(button => button.textContent.includes(label)).click();
  try {
    await act(async () => root.render(React.createElement(moduleObject.exports.default)));
    assert.deepEqual(requests, [null]);
    await act(async () => completePage({ drivers: drivers.slice(0, 4), cursor: 'driver-4', hasMore: true }));
    assert.equal(cards().length, 4);
    assert.equal(fullRosterReads, 0);
    assert.deepEqual(statsRequests, drivers.slice(0, 4).map(driver => driver.id));
    assert.deepEqual(tokenRequests, [drivers.slice(0, 4).map(driver => driver.id)]);

    await act(async () => {
      window.scrollY = 100;
      window.dispatchEvent(new window.Event('scroll'));
      window.scrollY = 150;
      window.dispatchEvent(new window.Event('scroll'));
    });
    assert.deepEqual(requests, [null, 'driver-4']);
    await act(async () => failPage(Error('offline')));
    assert.equal(cards().length, 4);
    await act(async () => click('Reintentar'));
    assert.equal(requests.at(-1), 'driver-4');
    await act(async () => completePage({ drivers: drivers.slice(4), cursor: 'driver-8', hasMore: false }));
    assert.equal(cards().length, 8);
    assert.equal(fullRosterReads, 0);
    assert.equal(statsRequests.length, 4, 'statistics do not exceed four concurrent drivers');
    assert.equal(tokenRequests.length, 2);

    await act(async () => click('Aprobar'));
    assert.equal(cards().length, 8);
    assert.deepEqual(requests, [null, 'driver-4', 'driver-4']);
    await act(async () => click('Ranking de Domiciliarios'));
    assert.deepEqual(requests, [null, 'driver-4', 'driver-4', null], 'ranking starts its own bounded queries on demand');
    assert.equal(fullRosterReads, 0);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    delete globalThis.adminDriversTest;
  }
});
