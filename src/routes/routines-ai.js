// src/routes/routines-ai.js
const router = require('express').Router();
const auth = require('../middlewares/auth');
const { Routine, Exercise, UserProfile, UserContext, TrainingSession, ExerciseLog } = require('../models');
const { Op } = require('sequelize');

const REACT_APP_XAI_API_KEY = process.env.REACT_APP_XAI_API_KEY;
const XAI_API_URL = 'https://api.x.ai/v1/chat/completions';

/**
 * Obtiene el historial de entrenamiento reciente del usuario
 */
async function getTrainingHistory(userId) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const sessions = await TrainingSession.findAll({
    where: {
      user_id: userId,
      completed: true,
      createdAt: { [Op.gte]: thirtyDaysAgo }
    },
    include: [
      { model: Routine, as: 'Routine', attributes: ['name', 'difficulty_level'] },
      { 
        model: ExerciseLog, 
        as: 'ExerciseLogs',
        include: [{ model: Exercise, as: 'Exercise', attributes: ['name'] }]
      }
    ],
    order: [['createdAt', 'DESC']],
    limit: 10
  });

  return sessions.map(s => ({
    date: s.createdAt,
    routine: s.Routine?.name,
    duration: s.total_duration,
    exercises: s.ExerciseLogs?.map(log => ({
      name: log.Exercise?.name,
      sets: log.completed_sets,
      reps: log.completed_reps
    }))
  }));
}

/**
 * Construye el prompt del sistema para Grok
 */
function buildSystemPrompt(profile, context, history) {
  return `Eres CalistenIA, un coach experto en calistenia y entrenamiento con peso corporal.

PERFIL DEL USUARIO:
- Nivel: ${profile?.experience_level || 'beginner'}
- Objetivos: ${profile?.goals || 'Mejorar fuerza y condición física'}
- Equipo disponible: ${JSON.stringify(profile?.available_equipment || ['ninguno'])}
- Lesiones/limitaciones: ${JSON.stringify(context?.injuries || [])}

PREFERENCIAS DE ENTRENAMIENTO:
- Enfoque: ${context?.training_focus || 'calisthenics'}
- Duración preferida: ${context?.preferred_duration || 45} minutos
- Intensidad: ${context?.preferred_intensity || 'moderate'}
- Tipos preferidos: ${JSON.stringify(context?.preferred_workout_types || ['strength'])}
- Incluir calentamiento: ${context?.include_warmup !== false ? 'sí' : 'no'}
- Incluir enfriamiento: ${context?.include_cooldown !== false ? 'sí' : 'no'}
- Ejercicios favoritos: ${JSON.stringify(context?.preferred_exercises || [])}
- Ejercicios a evitar: ${JSON.stringify(context?.avoided_exercises || [])}

HISTORIAL RECIENTE (últimos 30 días):
${history.length > 0 ? JSON.stringify(history.slice(0, 5), null, 2) : 'Sin entrenamientos registrados'}

REGLAS IMPORTANTES:
1. SIEMPRE genera rutinas de CALISTENIA (peso corporal) por defecto
2. Adapta la dificultad al nivel del usuario
3. Incluye variedad de ejercicios (empuje, tracción, piernas, core)
4. Para AMRAP: especifica ejercicios y duración total
5. Para HIIT: especifica tiempos de trabajo/descanso y rondas
6. Respeta las lesiones y ejercicios a evitar
7. Si el usuario no tiene contexto específico, genera una rutina balanceada de calistenia

FORMATO DE RESPUESTA PARA RUTINAS:
Debes responder SOLO con JSON válido cuando se solicite generar una rutina:
{
  "name": "Nombre descriptivo de la rutina",
  "description": "Descripción breve",
  "difficulty_level": "beginner|intermediate|advanced",
  "exercises": [
    {
      "name": "Nombre del ejercicio",
      "description": "Instrucciones breves",
      "exercise_type": "standard|amrap|hiit|emom|rest",
      "sets": 3,
      "reps": 10,
      "rest_time": 60,
      "amrap_duration": null,
      "hiit_work_time": null,
      "hiit_rest_time": null,
      "hiit_rounds": null,
      "target_metric": "reps|time|rounds",
      "notes": "Consejos opcionales"
    }
  ],
  "estimated_duration": 45,
  "warmup_included": true,
  "spotify_mood": "energetic|focused|intense|calm"
}`;
}

/**
 * POST /api/routines/generate-ai
 * Genera una rutina personalizada con Grok
 */
router.post('/generate-ai', auth, async (req, res) => {
  try {
    const { customPrompt, workoutType, duration, intensity } = req.body;

    // Obtener perfil y contexto
    const [profile, context] = await Promise.all([
      UserProfile.findOne({ where: { user_id: req.user.id } }),
      UserContext.findOne({ where: { user_id: req.user.id } })
    ]);

    // Obtener historial
    const history = await getTrainingHistory(req.user.id);

    // Construir prompt
    const systemPrompt = buildSystemPrompt(profile, context, history);
    
    let userPrompt = customPrompt || 'Genera una rutina de calistenia para hoy';
    
    // Añadir parámetros específicos si se proporcionan
    if (workoutType) userPrompt += `. Tipo: ${workoutType}`;
    if (duration) userPrompt += `. Duración: ${duration} minutos`;
    if (intensity) userPrompt += `. Intensidad: ${intensity}`;
    
    userPrompt += '. Responde SOLO con el JSON de la rutina, sin texto adicional.';

    // Llamar a Grok
    const response = await fetch(XAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${REACT_APP_XAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'grok-3-fast',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 2000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Error de Grok:', error);
      throw new Error('Error generando rutina con IA');
    }

    const data = await response.json();
    const aiResponse = data.choices[0]?.message?.content;

    // Parsear JSON de la respuesta
    let routineData;
    try {
      // Limpiar respuesta (a veces viene con ```json ... ```)
      const cleanJson = aiResponse.replace(/```json\n?|\n?```/g, '').trim();
      routineData = JSON.parse(cleanJson);
    } catch (parseErr) {
      console.error('Error parseando respuesta IA:', aiResponse);
      throw new Error('La IA generó una respuesta inválida');
    }

    // Crear rutina en BD
    const routine = await Routine.create({
      user_id: req.user.id,
      name: routineData.name,
      description: routineData.description,
      difficulty_level: routineData.difficulty_level || 'intermediate',
      is_ai_generated: true,
    });

    // Crear ejercicios
    if (routineData.exercises && routineData.exercises.length > 0) {
      const exercisesData = routineData.exercises.map((ex, index) => ({
        routine_id: routine.id,
        name: ex.name,
        description: ex.description || '',
        exercise_type: ex.exercise_type || 'standard',
        sets: ex.sets || 3,
        reps: ex.reps || 10,
        rest_time: ex.rest_time || 60,
        amrap_duration: ex.amrap_duration,
        hiit_work_time: ex.hiit_work_time,
        hiit_rest_time: ex.hiit_rest_time,
        hiit_rounds: ex.hiit_rounds,
        target_metric: ex.target_metric || 'reps',
        notes: ex.notes || '',
        order_index: index + 1,
      }));

      await Exercise.bulkCreate(exercisesData);
    }

    // Devolver rutina completa
    const fullRoutine = await Routine.findByPk(routine.id, {
      include: [{ model: Exercise, as: 'Exercises' }],
    });

    res.json({
      routine: fullRoutine,
      spotify_mood: routineData.spotify_mood || 'energetic',
      estimated_duration: routineData.estimated_duration
    });

  } catch (err) {
    console.error('Error en /routines/generate-ai:', err);
    res.status(500).json({ message: err.message || 'Error generando rutina con IA' });
  }
});

/**
 * GET /api/routines/ai-suggestions
 * Obtiene sugerencias rápidas basadas en el contexto
 */
router.get('/ai-suggestions', auth, async (req, res) => {
  try {
    const context = await UserContext.findOne({ where: { user_id: req.user.id } });
    const history = await getTrainingHistory(req.user.id);

    // Analizar qué grupos musculares se han trabajado recientemente
    const recentMuscles = new Set();
    history.forEach(session => {
      session.exercises?.forEach(ex => {
        const name = ex.name?.toLowerCase() || '';
        if (name.includes('flexion') || name.includes('push') || name.includes('pecho')) {
          recentMuscles.add('push');
        }
        if (name.includes('dominad') || name.includes('pull') || name.includes('remo')) {
          recentMuscles.add('pull');
        }
        if (name.includes('sentadilla') || name.includes('squat') || name.includes('pierna')) {
          recentMuscles.add('legs');
        }
      });
    });

    // Generar sugerencias
    const suggestions = [];
    
    if (!recentMuscles.has('push')) {
      suggestions.push({ type: 'push', label: 'Día de Empuje', description: 'Pecho, hombros y tríceps' });
    }
    if (!recentMuscles.has('pull')) {
      suggestions.push({ type: 'pull', label: 'Día de Tracción', description: 'Espalda y bíceps' });
    }
    if (!recentMuscles.has('legs')) {
      suggestions.push({ type: 'legs', label: 'Día de Piernas', description: 'Cuádriceps, isquios y glúteos' });
    }
    
    // Siempre añadir opciones de intensidad
    suggestions.push(
      { type: 'amrap', label: 'AMRAP 20 min', description: 'Máximas rondas posibles' },
      { type: 'hiit', label: 'HIIT Tabata', description: '20s trabajo / 10s descanso' },
      { type: 'fullbody', label: 'Full Body', description: 'Entrenamiento completo' }
    );

    res.json({ suggestions: suggestions.slice(0, 4) });
  } catch (err) {
    console.error('Error obteniendo sugerencias:', err);
    res.status(500).json({ message: 'Error obteniendo sugerencias' });
  }
});

module.exports = router;