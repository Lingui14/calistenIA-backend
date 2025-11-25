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
/**
 * POST /api/training/finish
 * Finaliza la sesión de entrenamiento y aprende del usuario
 */
/**
 * POST /api/training/finish
 * Finaliza la sesión de entrenamiento, aprende del usuario y actualiza rachas
 */
router.post('/finish', auth, async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ message: 'sessionId es requerido' });
    }

    const session = await TrainingSession.findOne({
      where: { id: sessionId, user_id: req.user.id },
      include: [
        { model: Routine, as: 'Routine' },
        { 
          model: ExerciseLog, 
          as: 'ExerciseLogs',
          include: [{ model: Exercise, as: 'Exercise' }]
        }
      ]
    });

    if (!session) {
      return res.status(404).json({ message: 'Sesión no encontrada' });
    }

    session.end_time = new Date();
    session.completed = true;
    
    const durationMs = session.end_time.getTime() - new Date(session.start_time).getTime();
    session.total_duration = Math.floor(durationMs / 1000 / 60);

    await session.save();

    // ========== APRENDER Y ACTUALIZAR RACHAS ==========
    let streakData = { current: 0, longest: 0, isNewRecord: false };
    
    try {
      const { UserContext } = require('../models');
      
      let context = await UserContext.findOne({ where: { user_id: req.user.id } });
      if (!context) {
        context = await UserContext.create({ user_id: req.user.id });
      }

      // Fecha de hoy (solo fecha, sin hora)
      const today = new Date().toISOString().split('T')[0];
      const lastWorkout = context.last_workout_date;
      
      let newStreak = context.current_streak || 0;
      let longestStreak = context.longest_streak || 0;
      let isNewRecord = false;

      if (!lastWorkout) {
        // Primer entrenamiento
        newStreak = 1;
      } else {
        const lastDate = new Date(lastWorkout);
        const todayDate = new Date(today);
        const diffTime = todayDate.getTime() - lastDate.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
          // Ya entrenó hoy, no cambiar racha
          newStreak = context.current_streak;
        } else if (diffDays === 1) {
          // Día consecutivo, aumentar racha
          newStreak = (context.current_streak || 0) + 1;
        } else {
          // Se rompió la racha, empezar de nuevo
          newStreak = 1;
        }
      }

      // Verificar si es nuevo récord
      if (newStreak > longestStreak) {
        longestStreak = newStreak;
        isNewRecord = true;
      }

      // Extraer ejercicios completados
      const completedExercises = session.ExerciseLogs?.map(log => log.Exercise?.name).filter(Boolean) || [];
      
      // Actualizar ejercicios favoritos
      const currentFavorites = context.preferred_exercises || [];
      const newFavorites = [...new Set([...currentFavorites, ...completedExercises])].slice(0, 30);

      // Calcular duración promedio preferida
      const currentDuration = context.preferred_duration || 45;
      const newPreferredDuration = Math.round((currentDuration + session.total_duration) / 2);

      // Actualizar resumen de entrenamiento
      const todayFormatted = new Date().toLocaleDateString('es-MX');
      const routineName = session.Routine?.name || 'Rutina';
      const exerciseCount = completedExercises.length;
      
      let trainingSummary = context.training_summary || '';
      const newEntry = `${todayFormatted}: ${routineName} (${exerciseCount} ejercicios, ${session.total_duration} min)`;
      
      const summaryLines = trainingSummary.split('\n').filter(Boolean);
      summaryLines.unshift(newEntry);
      trainingSummary = summaryLines.slice(0, 10).join('\n');

      // Actualizar totales
      const totalWorkouts = (context.total_workouts || 0) + 1;
      const totalMinutes = (context.total_minutes || 0) + session.total_duration;

      await context.update({
        preferred_exercises: newFavorites,
        preferred_duration: newPreferredDuration,
        training_summary: trainingSummary,
        current_streak: newStreak,
        longest_streak: longestStreak,
        last_workout_date: today,
        total_workouts: totalWorkouts,
        total_minutes: totalMinutes,
      });

      streakData = { 
        current: newStreak, 
        longest: longestStreak, 
        isNewRecord,
        totalWorkouts,
        totalMinutes 
      };

      console.log('📚 Actualizado:', {
        racha: newStreak,
        récord: longestStreak,
        nuevoRécord: isNewRecord,
        totalWorkouts,
        totalMinutes
      });
    } catch (learnErr) {
      console.error('Error actualizando contexto:', learnErr);
    }
    // ========== FIN APRENDIZAJE ==========

    const summary = {
      duration: session.total_duration,
      exercisesCompleted: session.ExerciseLogs?.length || 0,
      routineName: session.Routine?.name,
      streak: streakData,
    };

    res.json({ session, summary });
  } catch (err) {
    console.error('Error en POST /training/finish:', err);
    res.status(500).json({ message: 'Error finalizando sesión' });
  }
});

/**
 * GET /api/training/history
 * Obtiene el historial de sesiones del usuario
 */
// GET /api/training/history - Historial de entrenamientos
router.get('/history', auth, async (req, res) => {
  try {
    const sessions = await TrainingSession.findAll({
      where: { user_id: req.user.id },
      order: [['start_time', 'DESC']],
      limit: 50,
      include: [
        { 
          model: Routine, 
          as: 'Routine',  // debe coincidir con el alias en models/index.js
          attributes: ['id', 'name', 'difficulty_level'] 
        },
        { 
          model: ExerciseLog, 
          as: 'ExerciseLogs',  // debe coincidir con el alias en models/index.js
        },
      ],
    });

    res.json(sessions);
  } catch (err) {
    console.error('Error en GET /training/history:', err);
    res.status(500).json({ message: 'Error obteniendo historial', error: err.message });
  }
});

/**
 * GET /api/training/stats
 * Obtiene estadísticas del usuario (rachas, totales, etc.)
 */
router.get('/stats', auth, async (req, res) => {
  try {
    const { UserContext } = require('../models');
    
    let context = await UserContext.findOne({ where: { user_id: req.user.id } });
    
    if (!context) {
      return res.json({
        current_streak: 0,
        longest_streak: 0,
        total_workouts: 0,
        total_minutes: 0,
        last_workout_date: null,
      });
    }

    // Verificar si la racha sigue activa
    const today = new Date().toISOString().split('T')[0];
    const lastWorkout = context.last_workout_date;
    let currentStreak = context.current_streak || 0;

    if (lastWorkout) {
      const lastDate = new Date(lastWorkout);
      const todayDate = new Date(today);
      const diffTime = todayDate.getTime() - lastDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      // Si pasó más de 1 día, la racha se rompió
      if (diffDays > 1) {
        currentStreak = 0;
        await context.update({ current_streak: 0 });
      }
    }

    res.json({
      current_streak: currentStreak,
      longest_streak: context.longest_streak || 0,
      total_workouts: context.total_workouts || 0,
      total_minutes: context.total_minutes || 0,
      last_workout_date: context.last_workout_date,
    });
  } catch (err) {
    console.error('Error obteniendo stats:', err);
    res.status(500).json({ message: 'Error obteniendo estadísticas' });
  }
});

module.exports = router;
