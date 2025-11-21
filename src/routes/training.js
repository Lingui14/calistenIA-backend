const router = require('express').Router();
const auth = require('../middlewares/auth');
const { TrainingSession, ExerciseLog, Routine, Exercise } = require('../models');

/**
 * POST /api/training/start
 * Inicia una nueva sesión de entrenamiento
 */
router.post('/start', auth, async (req, res) => {
  try {
    const { routineId } = req.body;

    if (!routineId) {
      return res.status(400).json({ message: 'routineId es requerido' });
    }

    // Verificar que la rutina existe y pertenece al usuario
    const routine = await Routine.findOne({
      where: { id: routineId, user_id: req.user.id }
    });

    if (!routine) {
      return res.status(404).json({ message: 'Rutina no encontrada' });
    }

    const session = await TrainingSession.create({
      user_id: req.user.id,
      routine_id: routineId,
      start_time: new Date(),
      completed: false,
    });

    res.json(session);
  } catch (err) {
    console.error('Error en POST /training/start:', err);
    res.status(500).json({ message: 'Error iniciando sesión de entrenamiento' });
  }
});

/**
 * POST /api/training/log
 * Registra un ejercicio completado durante la sesión
 */
router.post('/log', auth, async (req, res) => {
  try {
    const { sessionId, exerciseId, completedSets, completedReps, notes } = req.body;

    if (!sessionId || !exerciseId) {
      return res.status(400).json({ message: 'sessionId y exerciseId son requeridos' });
    }

    // Verificar que la sesión existe y pertenece al usuario
    const session = await TrainingSession.findOne({
      where: { id: sessionId, user_id: req.user.id }
    });

    if (!session) {
      return res.status(404).json({ message: 'Sesión no encontrada' });
    }

    const log = await ExerciseLog.create({
      session_id: sessionId,
      exercise_id: exerciseId,
      completed_sets: completedSets || 0,
      completed_reps: completedReps || 0,
      notes: notes || '',
    });

    res.json(log);
  } catch (err) {
    console.error('Error en POST /training/log:', err);
    res.status(500).json({ message: 'Error guardando ejercicio' });
  }
});

/**
 * POST /api/training/finish
 * Finaliza la sesión de entrenamiento
 */
router.post('/finish', auth, async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ message: 'sessionId es requerido' });
    }

    const session = await TrainingSession.findOne({
      where: { id: sessionId, user_id: req.user.id }
    });

    if (!session) {
      return res.status(404).json({ message: 'Sesión no encontrada' });
    }

    session.end_time = new Date();
    session.completed = true;
    
    // Calcular duración en minutos
    const durationMs = session.end_time.getTime() - new Date(session.start_time).getTime();
    session.total_duration = Math.floor(durationMs / 1000 / 60); // minutos

    await session.save();

    // Obtener resumen con ejercicios completados
    const logs = await ExerciseLog.findAll({
      where: { session_id: sessionId }
    });

    res.json({
      ...session.toJSON(),
      exercisesCompleted: logs.length,
      totalSets: logs.reduce((acc, log) => acc + (log.completed_sets || 0), 0),
      totalReps: logs.reduce((acc, log) => acc + (log.completed_reps || 0), 0),
    });
  } catch (err) {
    console.error('Error en POST /training/finish:', err);
    res.status(500).json({ message: 'Error finalizando sesión' });
  }
});

/**
 * GET /api/training/history
 * Obtiene el historial de sesiones del usuario
 */
router.get('/history', auth, async (req, res) => {
  try {
    const sessions = await TrainingSession.findAll({
      where: { user_id: req.user.id },
      order: [['start_time', 'DESC']],
      include: [
        {
          model: Routine,
          attributes: ['id', 'name', 'difficulty_level'],
        },
        {
          model: ExerciseLog,
          include: [
            {
              model: Exercise,
              attributes: ['id', 'name'],
            }
          ]
        }
      ],
      limit: 50, // últimas 50 sesiones
    });

    res.json(sessions);
  } catch (err) {
    console.error('Error en GET /training/history:', err);
    res.status(500).json({ message: 'Error obteniendo historial' });
  }
});

module.exports = router;
