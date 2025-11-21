const router = require('express').Router();
const auth = require('../middlewares/auth');
const { ActivityLog } = require('../models');

// GET /api/activity/today - Actividad de hoy
router.get('/today', auth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    let activity = await ActivityLog.findOne({
      where: { user_id: req.user.id, date: today },
    });

    // Si no existe, crear registro de hoy con defaults
    if (!activity) {
      activity = await ActivityLog.create({
        user_id: req.user.id,
        date: today,
        steps: 0,
        calories_burned: 0,
        active_minutes: 0,
        steps_goal: 10000,
        calories_goal: 500,
        minutes_goal: 90,
      });
    }

    res.json(activity);
  } catch (err) {
    console.error('Error obteniendo actividad:', err);
    res.status(500).json({ message: 'Error obteniendo actividad' });
  }
});

// PUT /api/activity/today - Actualizar actividad de hoy
router.put('/today', auth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { steps, calories_burned, active_minutes } = req.body;

    let activity = await ActivityLog.findOne({
      where: { user_id: req.user.id, date: today },
    });

    if (!activity) {
      activity = await ActivityLog.create({
        user_id: req.user.id,
        date: today,
      });
    }

    await activity.update({
      steps: steps !== undefined ? steps : activity.steps,
      calories_burned: calories_burned !== undefined ? calories_burned : activity.calories_burned,
      active_minutes: active_minutes !== undefined ? active_minutes : activity.active_minutes,
    });

    res.json(activity);
  } catch (err) {
    console.error('Error actualizando actividad:', err);
    res.status(500).json({ message: 'Error actualizando actividad' });
  }
});

// PUT /api/activity/goals - Actualizar objetivos
router.put('/goals', auth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { steps_goal, calories_goal, minutes_goal } = req.body;

    let activity = await ActivityLog.findOne({
      where: { user_id: req.user.id, date: today },
    });

    if (!activity) {
      activity = await ActivityLog.create({
        user_id: req.user.id,
        date: today,
      });
    }

    await activity.update({
      steps_goal: steps_goal || activity.steps_goal,
      calories_goal: calories_goal || activity.calories_goal,
      minutes_goal: minutes_goal || activity.minutes_goal,
    });

    res.json(activity);
  } catch (err) {
    console.error('Error actualizando objetivos:', err);
    res.status(500).json({ message: 'Error actualizando objetivos' });
  }
});

// GET /api/activity/history - Historial de la semana
router.get('/history', auth, async (req, res) => {
  try {
    const { Op } = require('sequelize');
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const history = await ActivityLog.findAll({
      where: {
        user_id: req.user.id,
        date: { [Op.gte]: weekAgo.toISOString().split('T')[0] },
      },
      order: [['date', 'DESC']],
    });

    res.json(history);
  } catch (err) {
    console.error('Error obteniendo historial:', err);
    res.status(500).json({ message: 'Error obteniendo historial' });
  }
});

module.exports = router;