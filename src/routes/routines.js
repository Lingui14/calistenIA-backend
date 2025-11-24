// src/routes/routines.js (COMPLETO Y CORREGIDO CON CIRCUIT_EXERCISES)
const router = require('express').Router();
const auth = require('../middlewares/auth');
const { Routine, Exercise, UserProfile } = require('../models');

const XAI_API_KEY = process.env.REACT_APP_XAI_API_KEY;
const XAI_API_URL = 'https://api.x.ai/v1/chat/completions';

/**
 * Genera ejercicios de circuito por defecto si la IA falla
 */
function getDefaultCircuitExercises(exerciseType) {
  const defaults = {
    hiit: [
      { name: "Burpees", reps: null, duration: 40, description: "Burpees completos", tips: "Explosividad" },
      { name: "Mountain Climbers", reps: null, duration: 40, description: "Escaladores", tips: "Velocidad" },
      { name: "Jump Squats", reps: null, duration: 40, description: "Saltos", tips: "Aterriza suave" },
      { name: "Push-ups", reps: null, duration: 40, description: "Flexiones", tips: "Rango completo" },
      { name: "High Knees", reps: null, duration: 40, description: "Rodillas altas", tips: "Máxima velocidad" },
      { name: "Plank Jacks", reps: null, duration: 40, description: "Jacks en plancha", tips: "Core estable" }
    ],
    amrap: [
      { name: "Pull-ups", reps: 5, duration: null, description: "Dominadas", tips: "Rango completo" },
      { name: "Push-ups", reps: 10, duration: null, description: "Flexiones", tips: "Pecho al suelo" },
      { name: "Air Squats", reps: 15, duration: null, description: "Sentadillas", tips: "Profundidad" },
      { name: "Sit-ups", reps: 20, duration: null, description: "Abdominales", tips: "Explosivos" }
    ],
    emom: [
      { name: "Burpees", reps: 12, duration: null, description: "Burpees", tips: "Termina rápido" },
      { name: "Push-ups", reps: 15, duration: null, description: "Flexiones", tips: "Sin pausa" },
      { name: "Air Squats", reps: 20, duration: null, description: "Sentadillas", tips: "Constante" },
      { name: "Lunges", reps: 16, duration: null, description: "Zancadas", tips: "8 por pierna" }
    ]
  };
  return defaults[exerciseType] || defaults.amrap;
}

/**
 * POST /api/routines/generate-ai
 * Genera una rutina con IA de Grok
 */
router.post('/generate-ai', auth, async (req, res) => {
  try {
    const { customPrompt, workoutType, duration, intensity } = req.body;

    const profile = await UserProfile.findOne({ where: { user_id: req.user.id } });

    const systemPrompt = `Eres un experto en calistenia de alto nivel estilo Navy SEAL.

PERFIL USUARIO:
- Nivel: ${profile?.experience_level || 'intermediate'}
- Equipo: ${JSON.stringify(profile?.available_equipment || ['ninguno'])}

══════════════════════════════════════════════════════════════════════════════
REGLAS CRÍTICAS PARA EJERCICIOS HIIT/AMRAP/EMOM
══════════════════════════════════════════════════════════════════════════════

CADA ejercicio tipo HIIT, AMRAP o EMOM DEBE incluir el campo "circuit_exercises" con múltiples ejercicios:

PARA HIIT (5-8 ejercicios):
- Cada ronda de trabajo se hace UN ejercicio, rotando en orden
- El campo "circuit_exercises" contiene los ejercicios a rotar
- hiit_work_time: 40, hiit_rest_time: 20, hiit_rounds: 8-12

PARA AMRAP (4-6 ejercicios):
- El usuario hace todos los ejercicios en orden y cuenta rondas
- El campo "circuit_exercises" contiene los ejercicios con sus reps
- amrap_duration: 1200-2400 segundos (20-40 min)

PARA EMOM (3-5 ejercicios):
- Cada minuto corresponde a un ejercicio diferente
- El campo "circuit_exercises" contiene los ejercicios con sus reps
- emom_duration: 600-1800 segundos (10-30 min)

══════════════════════════════════════════════════════════════════════════════
FORMATO JSON OBLIGATORIO (sin markdown, sin texto adicional)
══════════════════════════════════════════════════════════════════════════════

{
  "name": "Nombre épico de la rutina",
  "description": "Descripción motivadora",
  "difficulty_level": "advanced",
  "exercises": [
    {
      "name": "HIIT Inferno: Warrior Circuit",
      "description": "Circuito HIIT de 6 ejercicios. 40s trabajo / 20s descanso. Rota entre ejercicios cada ronda.",
      "exercise_type": "hiit",
      "sets": null,
      "reps": null,
      "rest_time": null,
      "amrap_duration": null,
      "hiit_work_time": 40,
      "hiit_rest_time": 20,
      "hiit_rounds": 10,
      "emom_duration": null,
      "circuit_exercises": [
        { "name": "Burpees", "reps": null, "duration": 40, "description": "Explosión completa", "tips": "Pecho al suelo" },
        { "name": "Mountain Climbers", "reps": null, "duration": 40, "description": "Velocidad máxima", "tips": "Core apretado" },
        { "name": "Jump Squats", "reps": null, "duration": 40, "description": "Saltos explosivos", "tips": "Aterriza suave" },
        { "name": "Push-ups", "reps": null, "duration": 40, "description": "Flexiones estrictas", "tips": "Codos a 45°" },
        { "name": "High Knees", "reps": null, "duration": 40, "description": "Rodillas altas", "tips": "Máxima velocidad" },
        { "name": "Plank Jacks", "reps": null, "duration": 40, "description": "Jacks en plancha", "tips": "Caderas estables" }
      ],
      "notes": "Mantén intensidad máxima. Rota ejercicios cada ronda."
    },
    {
      "name": "AMRAP Challenge: Death Circuit",
      "description": "20 minutos. Completa tantas rondas como puedas.",
      "exercise_type": "amrap",
      "sets": null,
      "reps": null,
      "rest_time": null,
      "amrap_duration": 1200,
      "hiit_work_time": null,
      "hiit_rest_time": null,
      "hiit_rounds": null,
      "emom_duration": null,
      "circuit_exercises": [
        { "name": "Pull-ups", "reps": 5, "duration": null, "description": "Dominadas estrictas", "tips": "Rango completo" },
        { "name": "Push-ups", "reps": 10, "duration": null, "description": "Flexiones perfectas", "tips": "Pecho al suelo" },
        { "name": "Air Squats", "reps": 15, "duration": null, "description": "Sentadillas profundas", "tips": "Cadera bajo rodillas" },
        { "name": "Sit-ups", "reps": 20, "duration": null, "description": "Abdominales explosivos", "tips": "Toca los pies" }
      ],
      "notes": "1 ronda = todos los ejercicios. Objetivo: 5+ rondas."
    },
    {
      "name": "EMOM Destroyer",
      "description": "15 minutos. Cada minuto, un ejercicio diferente.",
      "exercise_type": "emom",
      "sets": null,
      "reps": null,
      "rest_time": null,
      "amrap_duration": null,
      "hiit_work_time": null,
      "hiit_rest_time": null,
      "hiit_rounds": null,
      "emom_duration": 900,
      "circuit_exercises": [
        { "name": "Burpees", "reps": 12, "duration": null, "description": "Burpees completos", "tips": "Termina rápido" },
        { "name": "Push-ups", "reps": 15, "duration": null, "description": "Flexiones estrictas", "tips": "Sin pausa" },
        { "name": "Air Squats", "reps": 20, "duration": null, "description": "Sentadillas", "tips": "Profundidad total" }
      ],
      "notes": "Minuto 1: Burpees, Minuto 2: Push-ups, Minuto 3: Squats, repite."
    }
  ]
}

EJERCICIOS DISPONIBLES:
- EMPUJE: Push-ups, Diamond Push-ups, Pike Push-ups, Dips, Clap Push-ups, Archer Push-ups
- TRACCIÓN: Pull-ups, Chin-ups, Australian Rows, Negative Pull-ups, Commando Pull-ups
- PIERNAS: Squats, Jump Squats, Lunges, Jump Lunges, Box Jumps, Wall Sit, Pistol Squats
- CORE: Plank, V-ups, Leg Raises, Mountain Climbers, Bicycle Crunches, Hollow Hold
- EXPLOSIVOS: Burpees, High Knees, Tuck Jumps, Star Jumps, Jumping Jacks, Skater Jumps

REGLAS FINALES:
1. SIEMPRE incluye "circuit_exercises" con 4-8 ejercicios para HIIT/AMRAP/EMOM
2. Nombres épicos e inspiradores
3. NUNCA uses ejercicios con pesas o máquinas
4. Responde SOLO con JSON válido`;

    let userPrompt = customPrompt || 'Genera una rutina HIIT extrema de calistenia';
    if (workoutType) userPrompt += `. Tipo: ${workoutType}`;
    if (duration) userPrompt += `. Duración: ${duration} minutos`;
    if (intensity) userPrompt += `. Intensidad: ${intensity}`;
    
    userPrompt += `

CRÍTICO: Cada ejercicio HIIT/AMRAP/EMOM DEBE tener "circuit_exercises" con 4-8 ejercicios diferentes.
Responde SOLO con JSON válido, SIN markdown, SIN texto adicional.`;

    console.log('🤖 Llamando a Grok...');

    const response = await fetch(XAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${XAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'grok-3-fast',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 4000,
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

    console.log('📝 Respuesta de Grok:', aiResponse);

    let routineData;
    try {
      const cleanJson = aiResponse.replace(/```json\n?|\n?```/g, '').trim();
      routineData = JSON.parse(cleanJson);
    } catch (parseErr) {
      console.error('❌ Error parseando JSON:', aiResponse);
      throw new Error('La IA generó una respuesta inválida');
    }

    // Validar y añadir circuit_exercises por defecto si falta
    if (routineData.exercises) {
      routineData.exercises = routineData.exercises.map(ex => {
        if (['hiit', 'amrap', 'emom'].includes(ex.exercise_type)) {
          if (!ex.circuit_exercises || !Array.isArray(ex.circuit_exercises) || ex.circuit_exercises.length < 3) {
            console.warn(`⚠️ Ejercicio ${ex.name} sin circuit_exercises válido, generando defaults`);
            ex.circuit_exercises = getDefaultCircuitExercises(ex.exercise_type);
          }
        }
        return ex;
      });
    }

    console.log('✅ Rutina parseada:', routineData);

    const routine = await Routine.create({
      user_id: req.user.id,
      name: routineData.name,
      description: routineData.description,
      difficulty_level: routineData.difficulty_level || 'advanced',
    });

    console.log('💾 Rutina creada en BD:', routine.id);

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
        circuit_exercises: ex.circuit_exercises || null, // ← CAMPO NUEVO
        notes: ex.notes || '',
        order_index: index + 1,
      }));

      await Exercise.bulkCreate(exercisesData);
      console.log('✅ Ejercicios creados:', exercisesData.length);
    }

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
 */
router.get('/active', auth, async (req, res) => {
  try {
    const routine = await Routine.findOne({
      where: { user_id: req.user.id },
      order: [['createdAt', 'DESC']],
      include: [{ model: Exercise, as: 'Exercises' }],
    });
    if (!routine) return res.json(null);
    res.json(routine);
  } catch (err) {
    console.error('Error obteniendo rutina activa:', err);
    res.status(500).json({ message: 'Error obteniendo rutina activa' });
  }
});

/**
 * POST /api/routines/generate
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
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const routine = await Routine.findOne({
      where: { id: req.params.id, user_id: req.user.id },
      include: [{ model: Exercise, as: 'Exercises' }],
    });
    if (!routine) return res.status(404).json({ message: 'Rutina no encontrada' });
    res.json(routine);
  } catch (err) {
    console.error('Error obteniendo rutina:', err);
    res.status(500).json({ message: 'Error obteniendo rutina' });
  }
});

/**
 * POST /api/routines
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
        circuit_exercises: ex.circuit_exercises || null,
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
 */
router.delete('/:id', auth, async (req, res) => {
  try {
    const routine = await Routine.findOne({
      where: { id: req.params.id, user_id: req.user.id }
    });
    if (!routine) return res.status(404).json({ message: 'Rutina no encontrada' });
    await routine.destroy();
    res.json({ message: 'Rutina eliminada' });
  } catch (err) {
    console.error('Error eliminando rutina:', err);
    res.status(500).json({ message: 'Error eliminando rutina' });
  }
});

module.exports = router;