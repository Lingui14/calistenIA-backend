const router = require('express').Router();
const auth = require('../middlewares/auth');
const { Routine, Exercise } = require('../models');

/**
 * GET /api/routines/active
 * Obtiene la rutina activa más reciente del usuario
 */
router.get('/active', auth, async (req, res) => {
  try {
    const routine = await Routine.findOne({
      where: { user_id: req.user.id },
      order: [['createdAt', 'DESC']],
      include: [
        { 
          model: Exercise, 
          as: 'Exercises',
          order: [['order_index', 'ASC']]
        }
      ],
    });

    if (!routine) {
      return res.status(404).json({ message: 'Sin rutina activa' });
    }

    return res.json(routine);
  } catch (err) {
    console.error('Error en GET /routines/active:', err);
    return res.status(500).json({ message: 'Error obteniendo rutina activa' });
  }
});

/**
 * GET /api/routines
 * Obtiene todas las rutinas del usuario
 */
router.get('/', auth, async (req, res) => {
  try {
    const routines = await Routine.findAll({
      where: { user_id: req.user.id },
      order: [['createdAt', 'DESC']],
      include: [
        { 
          model: Exercise, 
          as: 'Exercises' 
        }
      ],
    });

    return res.json(routines);
  } catch (err) {
    console.error('Error en GET /routines:', err);
    return res.status(500).json({ message: 'Error obteniendo rutinas' });
  }
});

/**
 * GET /api/routines/:id
 * Obtiene una rutina específica por ID
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const routine = await Routine.findOne({
      where: { id: req.params.id, user_id: req.user.id },
      include: [
        { 
          model: Exercise, 
          as: 'Exercises',
          order: [['order_index', 'ASC']]
        }
      ],
    });

    if (!routine) {
      return res.status(404).json({ message: 'Rutina no encontrada' });
    }

    return res.json(routine);
  } catch (err) {
    console.error('Error en GET /routines/:id:', err);
    return res.status(500).json({ message: 'Error obteniendo rutina' });
  }
});

/**
 * POST /api/routines/generate
 * Genera una nueva rutina (MVP: datos de ejemplo, después integrará Grok)
 */
router.post('/generate', auth, async (req, res) => {
  try {
    // TODO: Integrar Grok API para generar rutinas personalizadas
    // Por ahora, rutina de ejemplo para MVP
    
    const routine = await Routine.create({
      user_id: req.user.id,
      name: 'Rutina CalistenIA',
      description: 'Rutina personalizada generada con IA para principiantes',
      difficulty_level: 'beginner',
    });

    const exercisesData = [
      { 
        name: 'Flexiones', 
        description: 'Flexiones de pecho en el suelo',
        sets: 3, 
        reps: 10, 
        rest_time: 60, 
        order_index: 1 
      },
      { 
        name: 'Sentadillas', 
        description: 'Sentadillas con peso corporal',
        sets: 3, 
        reps: 15, 
        rest_time: 60, 
        order_index: 2 
      },
      { 
        name: 'Dominadas asistidas', 
        description: 'Dominadas con banda de resistencia o asistidas',
        sets: 3, 
        reps: 5, 
        rest_time: 90, 
        order_index: 3 
      },
      { 
        name: 'Plancha', 
        description: 'Plancha abdominal isométrica',
        sets: 3, 
        reps: 30, // segundos
        rest_time: 45, 
        order_index: 4 
      },
      { 
        name: 'Fondos en silla', 
        description: 'Fondos de tríceps usando una silla o banco',
        sets: 3, 
        reps: 12, 
        rest_time: 60, 
        order_index: 5 
      },
    ];

    const exercises = await Promise.all(
      exercisesData.map(e =>
        Exercise.create({ ...e, routine_id: routine.id })
      )
    );

    // Agregar ejercicios al objeto de respuesta
    const routineWithExercises = routine.toJSON();
    routineWithExercises.Exercises = exercises;

    return res.json(routineWithExercises);
  } catch (err) {
    console.error('Error en POST /routines/generate:', err);
    return res.status(500).json({ message: 'Error generando rutina' });
  }
});

/**
 * DELETE /api/routines/:id
 * Elimina una rutina
 */
router.delete('/:id', auth, async (req, res) => {
  try {
    const routine = await Routine.findOne({
      where: { id: req.params.id, user_id: req.user.id }
    });

    if (!routine) {
      return res.status(404).json({ message: 'Rutina no encontrada' });
    }

    await routine.destroy();
    return res.json({ message: 'Rutina eliminada' });
  } catch (err) {
    console.error('Error en DELETE /routines/:id:', err);
    return res.status(500).json({ message: 'Error eliminando rutina' });
  }
});

/**
 * PATCH /api/routines/:id/favorite
 * Marca/desmarca una rutina como favorita
 */
router.patch('/:id/favorite', auth, async (req, res) => {
  try {
    const routine = await Routine.findOne({
      where: { id: req.params.id, user_id: req.user.id }
    });

    if (!routine) {
      return res.status(404).json({ message: 'Rutina no encontrada' });
    }

    routine.is_favorite = !routine.is_favorite;
    await routine.save();

    return res.json(routine);
  } catch (err) {
    console.error('Error en PATCH /routines/:id/favorite:', err);
    return res.status(500).json({ message: 'Error actualizando favorito' });
  }
});

module.exports = router;
