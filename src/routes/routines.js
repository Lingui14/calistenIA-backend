const router = require('express').Router();
const auth = require('../middlewares/auth');
const { Routine, Exercise } = require('../models');

// GET /api/routines - Todas las rutinas del usuario
router.get('/', auth, async (req, res) => {
  try {
    const routines = await Routine.findAll({
      where: { user_id: req.user.id },
      order: [['createdAt', 'DESC']],
      include: [{ model: Exercise, as: 'Exercises' }],
    });
    res.json(routines);
  } catch (err) {
    console.error('Error obteniendo rutinas:', err);
    res.status(500).json({ message: 'Error obteniendo rutinas' });
  }
});

// GET /api/routines/active - Última rutina creada
router.get('/active', auth, async (req, res) => {
  try {
    const routine = await Routine.findOne({
      where: { user_id: req.user.id },
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

// POST /api/routines - Crear rutina personalizada
router.post('/', auth, async (req, res) => {
  try {
    const { name, description, difficulty_level, exercises } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'El nombre es requerido' });
    }

    const routine = await Routine.create({
      user_id: req.user.id,
      name,
      description: description || '',
      difficulty_level: difficulty_level || 'intermediate',
    });

    // Si vienen ejercicios, crearlos
    if (exercises && exercises.length > 0) {
      const exercisesData = exercises.map((ex, index) => ({
        routine_id: routine.id,
        name: ex.name,
        description: ex.description || '',
        sets: ex.sets || 3,
        reps: ex.reps || 10,
        rest_time: ex.rest_time || 60,
        order_index: index + 1,
      }));

      await Exercise.bulkCreate(exercisesData);
    }

    // Devolver rutina con ejercicios
    const fullRoutine = await Routine.findByPk(routine.id, {
      include: [{ model: Exercise, as: 'Exercises' }],
    });

    res.json(fullRoutine);
  } catch (err) {
    console.error('Error creando rutina:', err);
    res.status(500).json({ message: 'Error creando rutina' });
  }
});

// PUT /api/routines/:id - Actualizar rutina
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, description, difficulty_level, exercises } = req.body;

    const routine = await Routine.findOne({
      where: { id: req.params.id, user_id: req.user.id },
    });

    if (!routine) {
      return res.status(404).json({ message: 'Rutina no encontrada' });
    }

    // Actualizar datos básicos
    await routine.update({
      name: name || routine.name,
      description: description !== undefined ? description : routine.description,
      difficulty_level: difficulty_level || routine.difficulty_level,
    });

    // Si vienen ejercicios, reemplazar los existentes
    if (exercises && exercises.length > 0) {
      await Exercise.destroy({ where: { routine_id: routine.id } });

      const exercisesData = exercises.map((ex, index) => ({
        routine_id: routine.id,
        name: ex.name,
        description: ex.description || '',
        sets: ex.sets || 3,
        reps: ex.reps || 10,
        rest_time: ex.rest_time || 60,
        order_index: index + 1,
      }));

      await Exercise.bulkCreate(exercisesData);
    }

    // Devolver rutina actualizada
    const fullRoutine = await Routine.findByPk(routine.id, {
      include: [{ model: Exercise, as: 'Exercises' }],
    });

    res.json(fullRoutine);
  } catch (err) {
    console.error('Error actualizando rutina:', err);
    res.status(500).json({ message: 'Error actualizando rutina' });
  }
});

// DELETE /api/routines/:id - Eliminar rutina
router.delete('/:id', auth, async (req, res) => {
  try {
    const routine = await Routine.findOne({
      where: { id: req.params.id, user_id: req.user.id },
    });

    if (!routine) {
      return res.status(404).json({ message: 'Rutina no encontrada' });
    }

    // Eliminar ejercicios primero
    await Exercise.destroy({ where: { routine_id: routine.id } });
    await routine.destroy();

    res.json({ message: 'Rutina eliminada' });
  } catch (err) {
    console.error('Error eliminando rutina:', err);
    res.status(500).json({ message: 'Error eliminando rutina' });
  }
});

// POST /api/routines/generate - Generar rutina de ejemplo (IA MVP)
router.post('/generate', auth, async (req, res) => {
  try {
    const routine = await Routine.create({
      user_id: req.user.id,
      name: 'Rutina IA (MVP)',
      description: 'Rutina generada automáticamente',
      difficulty_level: 'beginner',
    });

    const exercisesData = [
      { routine_id: routine.id, name: 'Flexiones', sets: 3, reps: 10, rest_time: 60, order_index: 1 },
      { routine_id: routine.id, name: 'Sentadillas', sets: 3, reps: 15, rest_time: 60, order_index: 2 },
      { routine_id: routine.id, name: 'Dominadas asistidas', sets: 3, reps: 5, rest_time: 90, order_index: 3 },
      { routine_id: routine.id, name: 'Plancha', sets: 3, reps: 30, rest_time: 45, order_index: 4 },
      { routine_id: routine.id, name: 'Fondos en silla', sets: 3, reps: 8, rest_time: 60, order_index: 5 },
    ];

    await Exercise.bulkCreate(exercisesData);

    const fullRoutine = await Routine.findByPk(routine.id, {
      include: [{ model: Exercise, as: 'Exercises' }],
    });

    res.json(fullRoutine);
  } catch (err) {
    console.error('Error en /routines/generate:', err);
    res.status(500).json({ message: 'Error generando rutina' });
  }
});

// POST /api/routines/:id/favorite - Marcar como favorita
router.post('/:id/favorite', auth, async (req, res) => {
  try {
    const routine = await Routine.findOne({
      where: { id: req.params.id, user_id: req.user.id },
    });

    if (!routine) {
      return res.status(404).json({ message: 'Rutina no encontrada' });
    }

    await routine.update({ is_favorite: !routine.is_favorite });

    res.json(routine);
  } catch (err) {
    console.error('Error marcando favorita:', err);
    res.status(500).json({ message: 'Error actualizando rutina' });
  }
});

module.exports = router;