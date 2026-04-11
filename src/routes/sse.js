const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { EventEmitter } = require('events');
const router = Router();

// Global event emitter for batch progress
const batchProgress = new EventEmitter();
batchProgress.setMaxListeners(20);

router.get('/batch-progress', requireAuth, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('data: {"type":"connected"}\n\n');

  const onProgress = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  batchProgress.on('progress', onProgress);

  req.on('close', () => {
    batchProgress.off('progress', onProgress);
  });
});

module.exports = router;
module.exports.batchProgress = batchProgress;
