// src/routes/routines.js
const router = require('express').Router();
const auth = require('../middlewares/auth');
const Routine = require('../models/Routine');
const Exercise = require('../models/Exercise');

// GET /routines/active
router.get('/active', auth, async (req, res) => {
  try {
    const routine = await Routine.findOne({
      where: { user_id: req.user.id },
      // si usas timestamps de Sequelize, la columna es createdAt
      order: [['createdAt', 'DESC']],
      include: [{ model: Exercise, as: 'Exercises' }],
    });

    if (!routine) {
      return res.status(404).json({ message: 'Sin rutina activa' });
    }

    return res.json(routine);
  } catch (err) {
    console.error('Error en /routines/active:', err);
    return res.status(500).json({ message: 'Error obteniendo rutina activa' });
  }
});

// POST /routines/generate  (igual que antes)
router.post('/generate', auth, async (req, res) => {
  try {
    const routine = await Routine.create({
      user_id: req.user.id,
      name: 'Rutina IA (MVP)',
      description: 'Rutina generada de ejemplo',
      difficulty_level: 'beginner',
    });

    const exercisesData = [
      { name: 'Flexiones', sets: 3, reps: 10, rest_time: 60, order_index: 1 },
      { name: 'Sentadillas', sets: 3, reps: 15, rest_time: 60, order_index: 2 },
      { name: 'Dominadas asistidas', sets: 3, reps: 5, rest_time: 90, order_index: 3 },
    ];

    const exercises = await Promise.all(
      exercisesData.map(e =>
        Exercise.create({ ...e, routine_id: routine.id })
      )
    );

    routine.dataValues.Exercises = exercises;
    return res.json(routine);
  } catch (err) {
    console.error('Error en /routines/generate:', err);
    return res.status(500).json({ message: 'Error generando rutina' });
  }
});

module.exports = router;
