const { Router } = require('express');
const { login, isAuthRequired } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');

const router = Router();

router.post('/login', validate(schemas.loginRequest), (req, res) => {
  const result = login(req.body.password);
  if (result) return res.json(result);
  res.status(401).json({ error: 'Wrong password' });
});

router.get('/auth-required', (req, res) => res.json({ required: isAuthRequired() }));

module.exports = router;
