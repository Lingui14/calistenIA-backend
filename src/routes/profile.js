const router = require('express').Router();
const auth = require('../middlewares/auth');
const UserProfile = require('../models/UserProfile');

router.get('/me', auth, async (req, res) => {
  const profile = await UserProfile.findOne({ where: { user_id: req.user.id } });
  res.json(profile);
});

router.put('/me', auth, async (req, res) => {
  const profile = await UserProfile.findOne({ where: { user_id: req.user.id } });
  await profile.update(req.body); // MVP: sin tanta validación
  res.json(profile);
});

module.exports = router;
