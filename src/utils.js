function todayET() {
  try {
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } catch (e) { return new Date().toISOString().split('T')[0]; }
}

function daysAgoStr(n) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0];
}

function daysBetween(dateStr) {
  try {
    // Use ET offset calculation to match todayET behavior
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const target = new Date(dateStr + 'T12:00:00');
    return Math.floor((now - target) / 864e5);
  } catch (e) { return null; }
}

// Diagnostic log ring buffer
const _diagLogs = [];
function diagLog(msg) {
  const entry = '[' + new Date().toISOString() + '] ' + msg;
  console.log(entry);
  _diagLogs.push(entry);
  if (_diagLogs.length > 200) _diagLogs.shift();
}
function getDiagLogs() { return _diagLogs; }

// Write lock for serializing concurrent mutations to a JSON file
let _jobBoardLock = Promise.resolve();
let _lockSeq = 0;
function withJobBoardLock(fn) {
  const seq = ++_lockSeq;
  diagLog('LOCK queued seq=' + seq);
  _jobBoardLock = _jobBoardLock.then(() => {
    diagLog('LOCK executing seq=' + seq);
    return fn();
  }).catch(e => {
    diagLog('LOCK ERROR seq=' + seq + ': ' + (e && e.message || e));
  });
  return _jobBoardLock;
}

module.exports = { todayET, daysAgoStr, daysBetween, diagLog, getDiagLogs, withJobBoardLock };
