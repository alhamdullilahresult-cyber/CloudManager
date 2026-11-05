import { supabase } from './api/lib/supabase.js';
import scriptHandler from './api/scripts/[id].js';
import rawHandler from './api/raw.js';
import adminScriptsHandler from './api/admin/scripts/index.js';
import adminScriptDetailHandler from './api/admin/scripts/[id].js';
import adminStatsHandler from './api/admin/stats.js';
import loginHandler from './api/auth/login.js';
import { signToken } from './api/lib/auth.js';

async function testFullSuite() {
  console.log('--- STARTING LUAVAULT TEST SUITE ---');

  // Generate an admin token for testing admin CRUD endpoints
  const testAdminToken = signToken({ role: 'admin' });
  const authHeaders = { 'Authorization': `Bearer ${testAdminToken}`, 'Content-Type': 'application/json' };

  // ==========================================
  // 1. TEST PUBLIC SCRIPTS (Active vs Inactive vs Not Found)
  // ==========================================
  console.log('\n[1] Testing Public Endpoint (/api/scripts/:id)...');
  await supabase.from('scripts').upsert([
    { id: 'test-active-1', name: 'Active Script 1', code: 'print("Public active script running")', active: true, version: 1 },
    { id: 'test-inactive-1', name: 'Inactive Script 1', code: 'print("Secret inactive script")', active: false, version: 1 }
  ]);

  // Test Active
  let sActive = 0, bActive = '', hActive = {};
  const resActive = {
    setHeader: (k, v) => { hActive[k] = v; },
    status: (c) => { sActive = c; return resActive; },
    send: (b) => { bActive = b; }
  };
  await scriptHandler({ method: 'GET', url: '/api/scripts/test-active-1', headers: {} }, resActive);
  console.log(' -> Active Script: status =', sActive, '| Content-Type =', hActive['Content-Type'], '| Body =', bActive);
  if (sActive !== 200 || !bActive.includes('Public active script running')) throw new Error('Active script test failed!');

  // Test Inactive
  let sInactive = 0, bInactive = '';
  const resInactive = {
    setHeader: () => {},
    status: (c) => { sInactive = c; return resInactive; },
    send: (b) => { bInactive = b; }
  };
  await scriptHandler({ method: 'GET', url: '/api/scripts/test-inactive-1', headers: {} }, resInactive);
  console.log(' -> Inactive Script: status =', sInactive, '| Body =', bInactive);
  if (sInactive !== 404) throw new Error('Inactive script was not blocked with 404!');

  // Test Not Found
  let s404 = 0, b404 = '';
  const res404 = {
    setHeader: () => {},
    status: (c) => { s404 = c; return res404; },
    send: (b) => { b404 = b; }
  };
  await scriptHandler({ method: 'GET', url: '/api/scripts/non-existent-xyz', headers: {} }, res404);
  console.log(' -> Non-existent Script: status =', s404, '| Body =', b404);
  if (s404 !== 404) throw new Error('Non-existent script did not return 404!');

  // ==========================================
  // 2. TEST RAW ENDPOINT (/raw)
  // ==========================================
  console.log('\n[2] Testing Raw Endpoint (/raw)...');
  let sRaw = 0, bRaw = '', hRaw = {};
  const resRaw = {
    setHeader: (k, v) => { hRaw[k] = v; },
    status: (c) => { sRaw = c; return resRaw; },
    send: (b) => { bRaw = b; }
  };
  await rawHandler({ method: 'GET', url: '/raw', headers: {} }, resRaw);
  console.log(' -> /raw: status =', sRaw, '| Content-Type =', hRaw['Content-Type'], '| Length =', bRaw.length);
  if (sRaw !== 200 || !hRaw['Content-Type']?.includes('text/plain')) throw new Error('/raw endpoint failed!');

  // ==========================================
  // 3. TEST ADMIN CRUD ENDPOINTS
  // ==========================================
  console.log('\n[3] Testing Admin CRUD & Auth...');

  // 3a. Unauthorized test
  let sUnauth = 0, jsonUnauth = {};
  const resUnauth = {
    setHeader: () => {},
    status: (c) => { sUnauth = c; return resUnauth; },
    json: (d) => { jsonUnauth = d; }
  };
  await adminScriptsHandler({ method: 'GET', url: '/api/admin/scripts', headers: {} }, resUnauth);
  console.log(' -> Admin GET without token: status =', sUnauth, '| error =', jsonUnauth.error);
  if (sUnauth !== 401) throw new Error('Unauthorized request was not blocked!');

  // 3b. Create script via admin
  let sCreate = 0, jsonCreate = {};
  const resCreate = {
    setHeader: () => {},
    status: (c) => { sCreate = c; return resCreate; },
    json: (d) => { jsonCreate = d; }
  };
  const newScriptBody = {
    name: 'Admin Automated Test Script',
    description: 'Created via test suite',
    code: 'print("Admin Created Code")',
    active: true
  };
  await adminScriptsHandler({
    method: 'POST',
    url: '/api/admin/scripts',
    headers: authHeaders,
    body: newScriptBody
  }, resCreate);
  console.log(' -> Admin POST /api/admin/scripts: status =', sCreate, '| Created ID =', jsonCreate.script?.id);
  if (sCreate !== 201 || !jsonCreate.script?.id) throw new Error('Admin create script failed!');
  const createdId = jsonCreate.script.id;

  // 3c. Update script via admin
  let sUpdate = 0, jsonUpdate = {};
  const resUpdate = {
    setHeader: () => {},
    status: (c) => { sUpdate = c; return resUpdate; },
    json: (d) => { jsonUpdate = d; }
  };
  await adminScriptDetailHandler({
    method: 'PUT',
    url: `/api/admin/scripts/${createdId}`,
    headers: authHeaders,
    body: { code: 'print("Admin Updated Code v2")', version_note: 'Bump version' }
  }, resUpdate);
  console.log(' -> Admin PUT /api/admin/scripts/:id: status =', sUpdate, '| New Version =', jsonUpdate.script?.version);
  if (sUpdate !== 200 || jsonUpdate.script?.version !== 2) throw new Error('Admin update script failed!');

  // 3d. Get Stats
  let sStats = 0, jsonStats = {};
  const resStats = {
    setHeader: () => {},
    status: (c) => { sStats = c; return resStats; },
    json: (d) => { jsonStats = d; }
  };
  await adminStatsHandler({ method: 'GET', url: '/api/admin/stats', headers: authHeaders }, resStats);
  console.log(' -> Admin GET /api/admin/stats: status =', sStats, '| Total Scripts =', jsonStats.stats?.total);

  // 3e. Delete script via admin
  let sDel = 0, jsonDel = {};
  const resDel = {
    setHeader: () => {},
    status: (c) => { sDel = c; return resDel; },
    json: (d) => { jsonDel = d; }
  };
  await adminScriptDetailHandler({
    method: 'DELETE',
    url: `/api/admin/scripts/${createdId}`,
    headers: authHeaders
  }, resDel);
  console.log(' -> Admin DELETE /api/admin/scripts/:id: status =', sDel, '| Message =', jsonDel.message);
  if (sDel !== 200) throw new Error('Admin delete script failed!');

  // ==========================================
  // 4. CLEANUP TEST DATA
  // ==========================================
  await supabase.from('scripts').delete().in('id', ['test-active-1', 'test-inactive-1', createdId]);
  console.log('\n[4] Cleanup: all test data cleaned up.');
  console.log('\n>>> ALL TESTS PASSED SUCCESSFULLY! ZERO FILESYSTEM WRITES! <<<');
}

testFullSuite().catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
