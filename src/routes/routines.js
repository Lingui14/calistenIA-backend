// src/routes/routines.js (COMPLETO Y CORREGIDO)
const router = require('express').Router();
const auth = require('../middlewares/auth');
const { Routine, Exercise, UserProfile } = require('../models');

const XAI_API_KEY = process.env.REACT_APP_XAI_API_KEY;
const XAI_API_URL = 'https://api.x.ai/v1/chat/completions';

/**
 * POST /api/routines/generate-ai
 * Genera una rutina con IA de Grok
 */
router.post('/generate-ai', auth, async (req, res) => {
  try {
    const { customPrompt, workoutType, duration, intensity } = req.body;

    // Obtener perfil del usuario
    const profile = await UserProfile.findOne({ where: { user_id: req.user.id } });

    // Construir prompt para Grok
    const systemPrompt = `Eres un experto en calistenia de alto nivel estilo Navy SEAL.

PERFIL USUARIO:
- Nivel: ${profile?.experience_level || 'intermediate'}
- Equipo: ${JSON.stringify(profile?.available_equipment || ['ninguno'])}

REGLAS OBLIGATORIAS:
1. SIEMPRE incluye 70% ejercicios HIIT o AMRAP
2. Nombres épicos e inspiradores
3. Para HIIT: work 40s, rest 20s, rounds 8-12
4. Para AMRAP: duración 1200-2400 segundos (20-40 min)
5. Para EMOM: duración total en segundos (600-1800)
6. Ejercicios de calistenia: burpees, pull-ups, push-ups, squats, etc.
7. NUNCA uses ejercicios con pesas o máquinas

RESPONDE SOLO CON JSON VÁLIDO (sin markdown ni texto adicional):
{
  "name": "Nombre épico de la rutina",
  "description": "Descripción motivadora",
  "difficulty_level": "advanced",
  "exercises": [
    {
      "name": "Nombre del ejercicio",
      "description": "Instrucciones",
      "exercise_type": "hiit",
      "sets": null,
      "reps": null,
      "rest_time": null,
      "amrap_duration": null,
      "hiit_work_time": 40,
      "hiit_rest_time": 20,
      "hiit_rounds": 10,
      "emom_duration": null,
      "notes": "Tips"
    },
    {
      "name": "Otro ejercicio",
      "exercise_type": "amrap",
      "sets": null,
      "reps": null,
      "rest_time": null,
      "amrap_duration": 1200,
      "hiit_work_time": null,
      "hiit_rest_time": null,
      "hiit_rounds": null,
      "emom_duration": null,
      "notes": ""
    }
  ]
}`;

    let userPrompt = customPrompt || 'Genera una rutina HIIT extrema de calistenia';
    if (workoutType) userPrompt += `. Tipo: ${workoutType}`;
    if (duration) userPrompt += `. Duración: ${duration} minutos`;
    if (intensity) userPrompt += `. Intensidad: ${intensity}`;

    console.log('🤖 Llamando a Grok...');

    // Llamar a Grok
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
        temperature: 0.8
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Error de Grok:', error);
      throw new Error('Error generando rutina con IA');
    }

    const data = await response.json();
    const aiResponse = data.choices[0]?.message?.content;

    console.log('📝 Respuesta de Grok:', aiResponse);

    // Limpiar y parsear JSON
    let routineData;
    try {
      const cleanJson = aiResponse.replace(/```json\n?|\n?```/g, '').trim();
      routineData = JSON.parse(cleanJson);
    } catch (parseErr) {
      console.error('❌ Error parseando JSON:', aiResponse);
      throw new Error('La IA generó una respuesta inválida');
    }

    console.log('✅ Rutina parseada:', routineData);

    // Crear rutina en BD
    const routine = await Routine.create({
      user_id: req.user.id,
      name: routineData.name,
      description: routineData.description,
      difficulty_level: routineData.difficulty_level || 'advanced',
    });

    console.log('💾 Rutina creada en BD:', routine.id);

    // Crear ejercicios
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
      console.log('✅ Ejercicios creados:', exercisesData.length);
    }

    // Devolver rutina completa
    const fullRoutine = await Routine.findByPk(routine.id, {
      include: [{ model: Exercise, as: 'Exercises' }],
    });

    res.json({
      routine: fullRoutine,
      spotify_mood: 'intense',
    });

  } catch (err) {
    console.error('❌ Error completo en /routines/generate-ai:', err);
    res.status(500).json({ 
      message: err.message || 'Error generando rutina',
      error: err.toString()
    });
  }
});

/**
 * GET /api/routines/ai-suggestions
 * Sugerencias rápidas
 */
router.get('/ai-suggestions', auth, async (req, res) => {
  try {
    const suggestions = [
      { type: 'hiit', label: 'HIIT Extremo', description: 'Alta intensidad con intervalos' },
      { type: 'amrap', label: 'AMRAP Brutal', description: 'Máximas rondas posibles' },
      { type: 'fullbody', label: 'Full Body', description: 'Cuerpo completo' },
      { type: 'push', label: 'Push Day', description: 'Empuje intenso' },
    ];

    res.json({ suggestions });
  } catch (err) {
    res.status(500).json({ message: 'Error obteniendo sugerencias' });
  }
});

/**
 * GET /api/routines/active
 * Obtiene la rutina activa del día
 */
router.get('/active', auth, async (req, res) => {
  try {
    const routine = await Routine.findOne({
      where: { user_id: req.user.id },
      order: [['createdAt', 'DESC']],
      include: [{ model: Exercise, as: 'Exercises' }],
    });

    if (!routine) {
      return res.json(null);
    }

    res.json(routine);
  } catch (err) {
    console.error('Error obteniendo rutina activa:', err);
    res.status(500).json({ message: 'Error obteniendo rutina activa' });
  }
});

/**
 * POST /api/routines/generate
 * Genera una rutina básica sin IA
 */
router.post('/generate', auth, async (req, res) => {
  try {
    const routine = await Routine.create({
      user_id: req.user.id,
      name: 'Rutina Básica del Día',
      description: 'Rutina generada automáticamente',
      difficulty_level: 'intermediate',
    });

    const exercises = [
      { name: 'Push-ups', sets: 3, reps: 15, rest_time: 60, order_index: 1 },
      { name: 'Squats', sets: 3, reps: 20, rest_time: 60, order_index: 2 },
      { name: 'Plank', sets: 3, reps: 30, rest_time: 45, order_index: 3 },
      { name: 'Lunges', sets: 3, reps: 12, rest_time: 60, order_index: 4 },
    ];

    await Exercise.bulkCreate(
      exercises.map(ex => ({ ...ex, routine_id: routine.id }))
    );

    const fullRoutine = await Routine.findByPk(routine.id, {
      include: [{ model: Exercise, as: 'Exercises' }],
    });

    res.json(fullRoutine);
  } catch (err) {
    console.error('Error generando rutina:', err);
    res.status(500).json({ message: 'Error generando rutina' });
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
      include: [{ model: Exercise, as: 'Exercises' }],
    });

    res.json(routines);
  } catch (err) {
    console.error('Error obteniendo rutinas:', err);
    res.status(500).json({ message: 'Error obteniendo rutinas' });
  }
});

/**
 * GET /api/routines/:id
 * Obtiene una rutina específica por ID
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const routine = await Routine.findOne({
      where: { 
        id: req.params.id, 
        user_id: req.user.id 
      },
      include: [{ model: Exercise, as: 'Exercises' }],
    });

    if (!routine) {
      return res.status(404).json({ message: 'Rutina no encontrada' });
    }

    res.json(routine);
  } catch (err) {
    console.error('Error obteniendo rutina:', err);
    res.status(500).json({ message: 'Error obteniendo rutina' });
  }
});

/**
 * POST /api/routines
 * Crea una rutina personalizada
 */
router.post('/', auth, async (req, res) => {
  try {
    const { name, description, difficulty_level, exercises } = req.body;

    const routine = await Routine.create({
      user_id: req.user.id,
      name,
      description,
      difficulty_level: difficulty_level || 'custom',
    });

    if (exercises?.length > 0) {
      const exercisesData = exercises.map((ex, index) => ({
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

    res.json(fullRoutine);
  } catch (err) {
    console.error('Error creando rutina:', err);
    res.status(500).json({ message: 'Error creando rutina' });
  }
});

/**
 * DELETE /api/routines/:id
 * Elimina una rutina
 */
router.delete('/:id', auth, async (req, res) => {
  try {
    const routine = await Routine.findOne({
      where: { 
        id: req.params.id, 
        user_id: req.user.id 
      }
    });

    if (!routine) {
      return res.status(404).json({ message: 'Rutina no encontrada' });
    }

    await routine.destroy();
    res.json({ message: 'Rutina eliminada' });
  } catch (err) {
    console.error('Error eliminando rutina:', err);
    res.status(500).json({ message: 'Error eliminando rutina' });
  }
});

module.exports = router;
