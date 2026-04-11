const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const SEEDS_DIR = path.join(__dirname, '..', '..', 'seeds');

try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) { console.error('[store] init error:', e.message); }

// Seed file cache — seeds are immutable at runtime, no need to re-read
const _seedCache = {};

function readSeedSync(key) {
  if (_seedCache[key]) return _seedCache[key];
  const filePath = path.join(SEEDS_DIR, `seed_${key}.json`);
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    _seedCache[key] = data;
    return data;
  } catch (e) { return []; }
}

// Generic async JSON file helpers with proper error logging
async function loadJSON(filename, defaultValue) {
  const filePath = path.join(DATA_DIR, filename);
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code !== 'ENOENT') console.error(`[store] loadJSON(${filename}):`, e.message);
    return typeof defaultValue === 'function' ? defaultValue() : JSON.parse(JSON.stringify(defaultValue));
  }
}

async function saveJSON(filename, data) {
  const filePath = path.join(DATA_DIR, filename);
  try {
    await fsp.writeFile(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.error(`[store] saveJSON(${filename}):`, e.message);
    return false;
  }
}

// Specific stores with their default values
const DEFAULTS = {
  overrides: () => ({ firms: {}, ceos: {}, vcs: {} }),
  applications: () => [],
  job_board_leads: () => [],
  dynamic_contacts: () => [],
  networking: () => [],
  cron_state: () => ({ lastRunDate: null }),
  cal_config: () => ({ setup_complete: false, whitelisted_calendar_ids: [], whitelisted_calendar_names: {} }),
};

const loadOverrides = () => loadJSON('overrides.json', DEFAULTS.overrides);
const saveOverrides = (data) => saveJSON('overrides.json', data);
const loadApplications = () => loadJSON('applications.json', DEFAULTS.applications);
const saveApplications = (data) => saveJSON('applications.json', data);
const loadJobBoardLeads = () => loadJSON('job_board_leads.json', DEFAULTS.job_board_leads);
const loadDynamic = () => loadJSON('dynamic_contacts.json', DEFAULTS.dynamic_contacts);
const saveDynamic = (data) => saveJSON('dynamic_contacts.json', data);
const loadNetworking = () => loadJSON('networking.json', DEFAULTS.networking);
const saveNetworking = (data) => saveJSON('networking.json', data);
const loadCronState = () => loadJSON('cron_state.json', DEFAULTS.cron_state);
const saveCronState = (data) => saveJSON('cron_state.json', data);
const loadCalConfig = () => loadJSON('cal_config.json', DEFAULTS.cal_config);
const saveCalConfig = (data) => saveJSON('cal_config.json', data);

async function saveJobBoardLeads(data) {
  const ok = await saveJSON('job_board_leads.json', data);
  if (!ok) return false;
  // Verify write integrity for this critical file
  try {
    const verify = await loadJSON('job_board_leads.json', []);
    if (verify.length !== data.length) {
      console.error('[store] saveJobBoardLeads VERIFY FAILED: wrote', data.length, 'read back', verify.length);
      return false;
    }
  } catch (e) {
    console.error('[store] saveJobBoardLeads verify error:', e.message);
    return false;
  }
  return true;
}

module.exports = {
  DATA_DIR,
  SEEDS_DIR,
  readSeedSync,
  loadJSON,
  saveJSON,
  loadOverrides,
  saveOverrides,
  loadApplications,
  saveApplications,
  loadJobBoardLeads,
  saveJobBoardLeads,
  loadDynamic,
  saveDynamic,
  loadNetworking,
  saveNetworking,
  loadCronState,
  saveCronState,
  loadCalConfig,
  saveCalConfig,
};
