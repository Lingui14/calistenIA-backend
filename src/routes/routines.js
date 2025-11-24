// src/routes/routines.js
const router = require('express').Router();
const auth = require('../middlewares/auth');
const { Routine, Exercise, UserProfile, UserContext } = require('../models');

const XAI_API_KEY = process.env.REACT_APP_XAI_API_KEY;
const XAI_API_URL = 'https://api.x.ai/v1/chat/completions';

/**
 * POST /api/routines/generate-ai
 */
router.post('/generate-ai', auth, async (req, res) => {
  try {
    const { customPrompt, workoutType, duration, intensity } = req.body;

    const profile = await UserProfile.findOne({ where: { user_id: req.user.id } });
    const context = await UserContext.findOne({ where: { user_id: req.user.id } });

    // Determinar tipo de entrenamiento
    const trainingFocus = workoutType || context?.training_focus || 'mixed';
    
    let exerciseStyle = '';
    if (trainingFocus === 'weightlifting' || trainingFocus === 'halterofilia') {
      exerciseStyle = `INCLUYE EJERCICIOS DE HALTEROFILIA:
- Clean and Jerk, Snatch, Clean Pull, Snatch Pull
- Front Squat, Overhead Squat, Back Squat
- Push Press, Push Jerk, Split Jerk
- Deadlift, Romanian Deadlift`;
    } else if (trainingFocus === 'crossfit') {
      exerciseStyle = `ESTILO CROSSFIT - MEZCLA:
- Ejercicios olímpicos: Clean, Snatch, Thrusters
- Gimnásticos: Pull-ups, Muscle-ups, Handstand Push-ups
- Cardio: Box Jumps, Burpees, Double Unders, Row`;
    } else if (trainingFocus === 'mixed') {
      exerciseStyle = `MEZCLA PESAS Y CALISTENIA:
- Con barra: Squat, Deadlift, Press, Row
- Peso corporal: Pull-ups, Dips, Push-ups, Pistols
- Mancuernas: Lunges, Shoulder Press, Rows`;
    } else if (trainingFocus === 'calisthenics') {
      exerciseStyle = `SOLO PESO CORPORAL:
- Empuje: Push-ups, Dips, Pike Push-ups
- Tracción: Pull-ups, Rows, Chin-ups
- Piernas: Squats, Lunges, Pistols
- Core: Hollow Body, L-sit, Planks`;
    } else {
      exerciseStyle = 'Ejercicios variados de fuerza general';
    }

    const systemPrompt = `Eres un coach de fitness experto que genera rutinas personalizadas.

PERFIL USUARIO:
- Nivel: ${profile?.experience_level || 'intermediate'}
- Tipo de entrenamiento preferido: ${trainingFocus}
- Ejercicios favoritos: ${JSON.stringify(context?.preferred_exercises || [])}
- Ejercicios a evitar: ${JSON.stringify(context?.avoided_exercises || [])}
- Lesiones: ${JSON.stringify(context?.injuries || [])}

${exerciseStyle}

REGLAS OBLIGATORIAS:
1. Usa NOMBRES COMUNES de ejercicios (nunca nombres épicos o inventados)
2. Cada ejercicio DEBE tener una descripción clara de cómo ejecutarlo
3. Incluye 4-6 ejercicios variados
4. RESPETA el tipo de entrenamiento del usuario: ${trainingFocus}
5. EVITA ejercicios que el usuario quiere evitar
6. CONSIDERA las lesiones del usuario

RESPONDE SOLO CON JSON VÁLIDO (sin markdown):
{
  "name": "Rutina de [tipo] - [objetivo]",
  "description": "Descripción breve",
  "difficulty_level": "beginner|intermediate|advanced",
  "exercises": [
    {
      "name": "Nombre común del ejercicio",
      "description": "Posición inicial: ... Ejecución: ... Tips: ...",
      "exercise_type": "standard",
      "sets": 3,
      "reps": 10,
      "rest_time": 60,
      "notes": "Variaciones"
    }
  ]
}`;

    let userPrompt = customPrompt || `Genera una rutina de ${trainingFocus}`;
    if (duration) userPrompt += `. Duración: ${duration} minutos`;
    if (intensity) userPrompt += `. Intensidad: ${intensity}`;

    console.log('🤖 Generando rutina para:', trainingFocus);

    const response = await fetch(XAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${XAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'grok-4-fast-reasoning',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 2500,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Error de Grok:', error);
      throw new Error('Error generando rutina con IA');
    }

    const data = await response.json();
    const aiResponse = data.choices[0]?.message?.content;

    let routineData;
    try {
      const cleanJson = aiResponse.replace(/```json\n?|\n?```/g, '').trim();
      routineData = JSON.parse(cleanJson);
    } catch (parseErr) {
      console.error('❌ Error parseando JSON:', aiResponse);
      throw new Error('La IA generó una respuesta inválida');
    }

    console.log('✅ Rutina parseada:', routineData.name);

    const routine = await Routine.create({
      user_id: req.user.id,
      name: routineData.name,
      description: routineData.description,
      difficulty_level: routineData.difficulty_level || 'intermediate',
    });

    if (routineData.exercises?.length > 0) {
      const exercisesData = routineData.exercises.map((ex, index) => ({
        routine_id: routine.id,
        name: ex.name,
        description: ex.description || '',
        exercise_type: ex.exercise_type || 'standard',
        sets: ex.sets,
        reps: ex.reps,
        rest_time: ex.rest_time,
        amrap_duration: ex.amrap_duration,
        hiit_work_time: ex.hiit_work_time,
        hiit_rest_time: ex.hiit_rest_time,
        hiit_rounds: ex.hiit_rounds,
        emom_duration: ex.emom_duration,
        notes: ex.notes || '',
        order_index: index + 1,
      }));

      await Exercise.bulkCreate(exercisesData);
    }

    const fullRoutine = await Routine.findByPk(routine.id, {
      include: [{ model: Exercise, as: 'Exercises' }],
    });

    res.json({ routine: fullRoutine });

  } catch (err) {
    console.error('❌ Error en /routines/generate-ai:', err);
    res.status(500).json({ message: err.message || 'Error generando rutina' });
  }
});

// ... resto de las rutas (GET /, GET /active, POST /, DELETE /:id, etc.)
router.get('/ai-suggestions', auth, async (req, res) => {
  res.json({ suggestions: [
    { type: 'strength', label: 'Fuerza', description: 'Enfoque en fuerza' },
    { type: 'hiit', label: 'HIIT', description: 'Alta intensidad' },
    { type: 'fullbody', label: 'Full Body', description: 'Cuerpo completo' },
  ]});
});

router.get('/active', auth, async (req, res) => {
  try {
    const routine = await Routine.findOne({
      where: { user_id: req.user.id },
      order: [['createdAt', 'DESC']],
      include: [{ model: Exercise, as: 'Exercises' }],
    });
    res.json(routine || null);
  } catch (err) {
    res.status(500).json({ message: 'Error obteniendo rutina activa' });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const routines = await Routine.findAll({
      where: { user_id: req.user.id },
      order: [['createdAt', 'DESC']],
      include: [{ model: Exercise, as: 'Exercises' }],
    });
    res.json(routines);
  } catch (err) {
    res.status(500).json({ message: 'Error obteniendo rutinas' });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { name, description, difficulty_level, exercises } = req.body;

    const routine = await Routine.create({
      user_id: req.user.id,
      name,
      description,
      difficulty_level: difficulty_level || 'intermediate',
    });

    if (exercises?.length > 0) {
      await Exercise.bulkCreate(exercises.map((ex, i) => ({
        routine_id: routine.id,
        ...ex,
        order_index: i + 1,
      })));
    }

    const fullRoutine = await Routine.findByPk(routine.id, {
      include: [{ model: Exercise, as: 'Exercises' }],
    });

    res.json(fullRoutine);
  } catch (err) {
    res.status(500).json({ message: 'Error creando rutina' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const routine = await Routine.findOne({
      where: { id: req.params.id, user_id: req.user.id },
    });

    if (!routine) return res.status(404).json({ message: 'Rutina no encontrada' });

    await Exercise.destroy({ where: { routine_id: routine.id } });
    await routine.destroy();

    res.json({ message: 'Rutina eliminada' });
  } catch (err) {
    res.status(500).json({ message: 'Error eliminando rutina' });
  }
});

module.exports = router;