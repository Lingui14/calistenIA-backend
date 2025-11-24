// src/routes/routines.js
const router = require('express').Router();
const auth = require('../middlewares/auth');
const { Routine, Exercise, UserProfile } = require('../models');

const XAI_API_KEY = process.env.REACT_APP_XAI_API_KEY;
const XAI_API_URL = 'https://api.x.ai/v1/chat/completions';

/**
 * Calcula la duración total de una rutina en minutos
 */
function calculateRoutineDuration(exercises) {
  let totalSeconds = 0;
  
  exercises.forEach(ex => {
    if (ex.exercise_type === 'hiit') {
      const workTime = ex.hiit_work_time || 40;
      const restTime = ex.hiit_rest_time || 20;
      const rounds = ex.hiit_rounds || 8;
      totalSeconds += (workTime + restTime) * rounds;
    } else if (ex.exercise_type === 'amrap') {
      totalSeconds += ex.amrap_duration || 1200;
    } else if (ex.exercise_type === 'emom') {
      totalSeconds += ex.emom_duration || 600;
    } else if (ex.exercise_type === 'standard') {
      const sets = ex.sets || 3;
      const restTime = ex.rest_time || 60;
      const timePerSet = 45; // estimado
      totalSeconds += (timePerSet + restTime) * sets;
    } else if (ex.exercise_type === 'rest') {
      totalSeconds += ex.rest_time || 120;
    }
  });
  
  return Math.ceil(totalSeconds / 60);
}

/**
 * Genera ejercicios de circuito por defecto
 */
function getDefaultCircuitExercises(exerciseType, muscleGroup = 'fullbody') {
  const exercises = {
    push: [
      { name: "Push-ups", reps: 15, duration: null, description: "Flexiones estrictas", tips: "Codos a 45°" },
      { name: "Diamond Push-ups", reps: 12, duration: null, description: "Flexiones diamante", tips: "Manos juntas" },
      { name: "Pike Push-ups", reps: 10, duration: null, description: "Flexiones pike", tips: "Caderas arriba" },
      { name: "Archer Push-ups", reps: 8, duration: null, description: "Flexiones arquero", tips: "Alterna lados" },
      { name: "Decline Push-ups", reps: 12, duration: null, description: "Flexiones declinadas", tips: "Pies elevados" },
    ],
    pull: [
      { name: "Pull-ups", reps: 8, duration: null, description: "Dominadas estrictas", tips: "Rango completo" },
      { name: "Chin-ups", reps: 8, duration: null, description: "Dominadas supinas", tips: "Bíceps activos" },
      { name: "Australian Rows", reps: 12, duration: null, description: "Remo invertido", tips: "Pecho a la barra" },
      { name: "Negative Pull-ups", reps: 5, duration: null, description: "Negativas de dominada", tips: "5 seg bajando" },
      { name: "Commando Pull-ups", reps: 6, duration: null, description: "Dominadas comando", tips: "Alterna lados" },
    ],
    legs: [
      { name: "Jump Squats", reps: 15, duration: null, description: "Sentadillas con salto", tips: "Explosividad" },
      { name: "Lunges", reps: 20, duration: null, description: "Zancadas alternadas", tips: "10 por pierna" },
      { name: "Bulgarian Split Squats", reps: 12, duration: null, description: "Sentadilla búlgara", tips: "6 por pierna" },
      { name: "Box Jumps", reps: 10, duration: null, description: "Saltos al cajón", tips: "Aterriza suave" },
      { name: "Wall Sit", reps: 45, duration: null, description: "Sentadilla isométrica", tips: "45 segundos" },
    ],
    core: [
      { name: "V-ups", reps: 15, duration: null, description: "Abdominales en V", tips: "Toca los pies" },
      { name: "Leg Raises", reps: 12, duration: null, description: "Elevación de piernas", tips: "Controlado" },
      { name: "Bicycle Crunches", reps: 30, duration: null, description: "Bicicleta", tips: "15 por lado" },
      { name: "Plank", reps: 60, duration: null, description: "Plancha", tips: "60 segundos" },
      { name: "Mountain Climbers", reps: 30, duration: null, description: "Escaladores", tips: "Velocidad" },
    ],
    fullbody: [
      { name: "Burpees", reps: null, duration: 40, description: "Burpees completos", tips: "Explosividad" },
      { name: "Mountain Climbers", reps: null, duration: 40, description: "Escaladores", tips: "Velocidad" },
      { name: "Jump Squats", reps: null, duration: 40, description: "Saltos", tips: "Aterriza suave" },
      { name: "Push-ups", reps: null, duration: 40, description: "Flexiones", tips: "Rango completo" },
      { name: "High Knees", reps: null, duration: 40, description: "Rodillas altas", tips: "Máxima velocidad" },
      { name: "Plank Jacks", reps: null, duration: 40, description: "Jacks en plancha", tips: "Core estable" },
    ],
  };
  
  return exercises[muscleGroup] || exercises.fullbody;
}

/**
 * POST /api/routines/generate-ai
 */
router.post('/generate-ai', auth, async (req, res) => {
  try {
    const { customPrompt, workoutType, duration, intensity, muscleGroup } = req.body;
    const profile = await UserProfile.findOne({ where: { user_id: req.user.id } });

    const systemPrompt = `Eres un coach experto en calistenia estilo Navy SEAL.

PERFIL: Nivel ${profile?.experience_level || 'intermediate'}, Equipo: ${JSON.stringify(profile?.available_equipment || ['ninguno'])}

═══════════════════════════════════════════════════════════════════════
REGLAS DE GENERACIÓN DE RUTINAS
═══════════════════════════════════════════════════════════════════════

1. VARIEDAD DE BLOQUES OBLIGATORIA:
   - Cada rutina debe tener MÍNIMO 3-5 bloques diferentes
   - Combina: 1-2 bloques HIIT + 1 bloque AMRAP + 1-2 bloques STANDARD + 1 bloque de descanso activo
   - NUNCA generes una rutina con solo un tipo de bloque

2. GRUPOS MUSCULARES:
   - Si el usuario pide un grupo específico (push, pull, legs, core), enfócate en ese grupo
   - Para fullbody, incluye ejercicios de todos los grupos
   - Ejercicios por grupo:
     * PUSH: Push-ups, Diamond Push-ups, Pike Push-ups, Dips, Archer Push-ups, Clap Push-ups
     * PULL: Pull-ups, Chin-ups, Australian Rows, Negative Pull-ups, Commando Pull-ups
     * LEGS: Squats, Jump Squats, Lunges, Jump Lunges, Pistol Squats, Bulgarian Split Squats, Box Jumps
     * CORE: Plank, V-ups, Leg Raises, Hollow Hold, L-sit, Bicycle Crunches, Mountain Climbers

3. CIRCUIT_EXERCISES OBLIGATORIO:
   - Cada bloque HIIT/AMRAP/EMOM DEBE tener "circuit_exercises" con 4-6 ejercicios
   - Ejercicios diversos dentro del grupo muscular solicitado

4. ESTRUCTURA DE RUTINA EJEMPLO (45 min):
   - Calentamiento: 5 min (ejercicios standard de movilidad)
   - Bloque 1: HIIT 8 rondas (40s/20s) - ~8 min
   - Bloque 2: AMRAP 12 min - ~12 min  
   - Bloque 3: Fuerza standard 3x10 - ~10 min
   - Bloque 4: EMOM 8 min - ~8 min
   - Enfriamiento: 2 min descanso activo

═══════════════════════════════════════════════════════════════════════
FORMATO JSON OBLIGATORIO:
═══════════════════════════════════════════════════════════════════════

{
  "name": "Nombre Épico de la Rutina",
  "description": "Descripción motivadora",
  "difficulty_level": "intermediate",
  "estimated_duration": 45,
  "muscle_focus": "push",
  "exercises": [
    {
      "name": "Warm-up: Dynamic Stretching",
      "description": "Movilidad articular y activación",
      "exercise_type": "standard",
      "sets": 1,
      "reps": 10,
      "rest_time": 0,
      "notes": "Círculos de brazos, rotaciones de cadera"
    },
    {
      "name": "HIIT Inferno: Push Destroyer",
      "description": "Circuito HIIT de empuje",
      "exercise_type": "hiit",
      "hiit_work_time": 40,
      "hiit_rest_time": 20,
      "hiit_rounds": 8,
      "circuit_exercises": [
        {"name": "Push-ups", "reps": null, "duration": 40, "description": "Flexiones estrictas", "tips": "Codos 45°"},
        {"name": "Diamond Push-ups", "reps": null, "duration": 40, "description": "Diamante", "tips": "Manos juntas"},
        {"name": "Pike Push-ups", "reps": null, "duration": 40, "description": "Pike", "tips": "Hombros"},
        {"name": "Wide Push-ups", "reps": null, "duration": 40, "description": "Amplias", "tips": "Pecho"}
      ],
      "notes": "Rota ejercicios cada ronda"
    },
    {
      "name": "AMRAP Challenge: Push Endurance",
      "description": "Máximas rondas en 12 min",
      "exercise_type": "amrap",
      "amrap_duration": 720,
      "circuit_exercises": [
        {"name": "Push-ups", "reps": 10, "description": "Flexiones", "tips": "Estrictas"},
        {"name": "Dips", "reps": 8, "description": "Fondos", "tips": "Profundidad"},
        {"name": "Diamond Push-ups", "reps": 8, "description": "Diamante", "tips": "Tríceps"}
      ],
      "notes": "Cuenta las rondas completadas"
    },
    {
      "name": "Strength: Archer Push-ups",
      "description": "Fuerza unilateral",
      "exercise_type": "standard",
      "sets": 3,
      "reps": 6,
      "rest_time": 90,
      "notes": "6 por lado, controla el movimiento"
    },
    {
      "name": "Active Recovery",
      "description": "Recuperación activa",
      "exercise_type": "rest",
      "rest_time": 120,
      "notes": "Estiramientos suaves de pecho y hombros"
    }
  ]
}

RECUERDA:
- SIEMPRE varía los tipos de bloques (HIIT + AMRAP + STANDARD + REST)
- SIEMPRE incluye circuit_exercises para HIIT/AMRAP/EMOM
- SIEMPRE calcula estimated_duration aproximada
- SIEMPRE adapta al grupo muscular solicitado`;

    let userPrompt = customPrompt || 'Genera una rutina variada de calistenia';
    if (workoutType) userPrompt += `. Enfoque: ${workoutType}`;
    if (muscleGroup) userPrompt += `. Grupo muscular: ${muscleGroup}`;
    if (duration) userPrompt += `. Duración aproximada: ${duration} minutos`;
    if (intensity) userPrompt += `. Intensidad: ${intensity}`;
    
    userPrompt += `

IMPORTANTE:
1. Incluye MÍNIMO 4 bloques diferentes (mezcla HIIT, AMRAP, STANDARD, REST)
2. Cada bloque HIIT/AMRAP/EMOM debe tener "circuit_exercises" con 4-6 ejercicios
3. Calcula "estimated_duration" en minutos
4. Responde SOLO con JSON válido`;

    console.log('🤖 Generando rutina variada...');

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
        max_tokens: 4500,
        temperature: 0.8
      })
    });

    if (!response.ok) {
      throw new Error('Error generando rutina con IA');
    }

    const data = await response.json();
    const aiResponse = data.choices[0]?.message?.content;

    let routineData;
    try {
      const cleanJson = aiResponse.replace(/```json\n?|\n?```/g, '').trim();
      routineData = JSON.parse(cleanJson);
    } catch (parseErr) {
      console.error('❌ Error parseando JSON');
      throw new Error('La IA generó una respuesta inválida');
    }

    // Validar y añadir circuit_exercises por defecto si falta
    const muscleTarget = routineData.muscle_focus || muscleGroup || 'fullbody';
    if (routineData.exercises) {
      routineData.exercises = routineData.exercises.map(ex => {
        if (['hiit', 'amrap', 'emom'].includes(ex.exercise_type)) {
          if (!ex.circuit_exercises || ex.circuit_exercises.length < 3) {
            ex.circuit_exercises = getDefaultCircuitExercises(ex.exercise_type, muscleTarget);
          }
        }
        return ex;
      });
    }

    // Calcular duración si no viene
    const estimatedDuration = routineData.estimated_duration || calculateRoutineDuration(routineData.exercises);

    const routine = await Routine.create({
      user_id: req.user.id,
      name: routineData.name,
      description: routineData.description,
      difficulty_level: routineData.difficulty_level || 'intermediate',
      estimated_duration: estimatedDuration,
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
        circuit_exercises: ex.circuit_exercises || null,
        notes: ex.notes || '',
        order_index: index + 1,
      }));

      await Exercise.bulkCreate(exercisesData);
    }

    const fullRoutine = await Routine.findByPk(routine.id, {
      include: [{ model: Exercise, as: 'Exercises' }],
    });

    res.json({
      routine: fullRoutine,
      estimated_duration: estimatedDuration,
      spotify_mood: 'intense',
    });

  } catch (err) {
    console.error('❌ Error:', err);
    res.status(500).json({ message: err.message || 'Error generando rutina' });
  }
});

// ... resto de endpoints igual ...
router.get('/ai-suggestions', auth, async (req, res) => {
  res.json({ suggestions: [
    { type: 'hiit', label: 'HIIT Extremo', description: 'Alta intensidad' },
    { type: 'amrap', label: 'AMRAP Brutal', description: 'Máximas rondas' },
    { type: 'push', label: 'Push Day', description: 'Pecho y tríceps' },
    { type: 'pull', label: 'Pull Day', description: 'Espalda y bíceps' },
    { type: 'legs', label: 'Leg Day', description: 'Piernas completas' },
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
    res.status(500).json({ message: 'Error' });
  }
});

router.post('/generate', auth, async (req, res) => {
  try {
    const routine = await Routine.create({
      user_id: req.user.id,
      name: 'Rutina Básica',
      description: 'Rutina generada automáticamente',
      difficulty_level: 'intermediate',
    });
    const exercises = [
      { name: 'Push-ups', sets: 3, reps: 15, rest_time: 60, order_index: 1 },
      { name: 'Squats', sets: 3, reps: 20, rest_time: 60, order_index: 2 },
      { name: 'Plank', sets: 3, reps: 30, rest_time: 45, order_index: 3 },
      { name: 'Lunges', sets: 3, reps: 12, rest_time: 60, order_index: 4 },
    ];
    await Exercise.bulkCreate(exercises.map(ex => ({ ...ex, routine_id: routine.id })));
    const fullRoutine = await Routine.findByPk(routine.id, { include: [{ model: Exercise, as: 'Exercises' }] });
    res.json(fullRoutine);
  } catch (err) {
    res.status(500).json({ message: 'Error' });
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
    res.status(500).json({ message: 'Error' });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const routine = await Routine.findOne({
      where: { id: req.params.id, user_id: req.user.id },
      include: [{ model: Exercise, as: 'Exercises' }],
    });
    if (!routine) return res.status(404).json({ message: 'No encontrada' });
    res.json(routine);
  } catch (err) {
    res.status(500).json({ message: 'Error' });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { name, description, difficulty_level, exercises } = req.body;
    const routine = await Routine.create({
      user_id: req.user.id, name, description, difficulty_level: difficulty_level || 'custom',
    });
    if (exercises?.length > 0) {
      await Exercise.bulkCreate(exercises.map((ex, i) => ({
        routine_id: routine.id, ...ex, order_index: i + 1,
      })));
    }
    const fullRoutine = await Routine.findByPk(routine.id, { include: [{ model: Exercise, as: 'Exercises' }] });
    res.json(fullRoutine);
  } catch (err) {
    res.status(500).json({ message: 'Error' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const routine = await Routine.findOne({ where: { id: req.params.id, user_id: req.user.id } });
    if (!routine) return res.status(404).json({ message: 'No encontrada' });
    await routine.destroy();
    res.json({ message: 'Eliminada' });
  } catch (err) {
    res.status(500).json({ message: 'Error' });
  }
});

module.exports = router;