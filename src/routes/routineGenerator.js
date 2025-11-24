// src/routes/routineGenerator.js
const { Routine, Exercise, UserProfile } = require('../models');

const XAI_API_KEY = process.env.REACT_APP_XAI_API_KEY;
const XAI_API_URL = 'https://api.x.ai/v1/chat/completions';

function calculateRoutineDuration(exercises) {
  let totalSeconds = 0;
  exercises.forEach(ex => {
    if (ex.exercise_type === 'hiit') {
      totalSeconds += ((ex.hiit_work_time || 40) + (ex.hiit_rest_time || 20)) * (ex.hiit_rounds || 8);
    } else if (ex.exercise_type === 'amrap') {
      totalSeconds += ex.amrap_duration || 1200;
    } else if (ex.exercise_type === 'emom') {
      totalSeconds += ex.emom_duration || 600;
    } else if (ex.exercise_type === 'standard') {
      totalSeconds += ((ex.sets || 3) * 45) + ((ex.sets || 3) * (ex.rest_time || 60));
    } else if (ex.exercise_type === 'rest') {
      totalSeconds += ex.rest_time || 120;
    }
  });
  return Math.ceil(totalSeconds / 60);
}

function getDefaultCircuitExercises(muscleGroup) {
  const exercises = {
    push: [
      { name: "Push-ups", reps: 15, description: "Flexiones estrictas", tips: "Codos a 45°" },
      { name: "Diamond Push-ups", reps: 12, description: "Diamante", tips: "Manos juntas" },
      { name: "Pike Push-ups", reps: 10, description: "Pike", tips: "Hombros" },
      { name: "Archer Push-ups", reps: 8, description: "Arquero", tips: "Alterna" },
    ],
    pull: [
      { name: "Pull-ups", reps: 8, description: "Dominadas", tips: "Rango completo" },
      { name: "Chin-ups", reps: 8, description: "Supinas", tips: "Bíceps" },
      { name: "Australian Rows", reps: 12, description: "Remo invertido", tips: "Pecho a barra" },
      { name: "Negative Pull-ups", reps: 5, description: "Negativas", tips: "5 seg bajando" },
    ],
    legs: [
      { name: "Jump Squats", reps: 15, description: "Saltos", tips: "Explosividad" },
      { name: "Lunges", reps: 20, description: "Zancadas", tips: "10 por pierna" },
      { name: "Bulgarian Split Squats", reps: 12, description: "Búlgara", tips: "6 por pierna" },
      { name: "Box Jumps", reps: 10, description: "Saltos al cajón", tips: "Aterriza suave" },
    ],
    core: [
      { name: "V-ups", reps: 15, description: "Abdominales V", tips: "Toca los pies" },
      { name: "Leg Raises", reps: 12, description: "Elevación piernas", tips: "Controlado" },
      { name: "Plank", reps: 60, description: "Plancha", tips: "60 segundos" },
      { name: "Mountain Climbers", reps: 30, description: "Escaladores", tips: "Velocidad" },
    ],
    fullbody: [
      { name: "Burpees", reps: null, duration: 40, description: "Burpees", tips: "Explosividad" },
      { name: "Mountain Climbers", reps: null, duration: 40, description: "Escaladores", tips: "Velocidad" },
      { name: "Jump Squats", reps: null, duration: 40, description: "Saltos", tips: "Suave" },
      { name: "Push-ups", reps: null, duration: 40, description: "Flexiones", tips: "Rango" },
      { name: "High Knees", reps: null, duration: 40, description: "Rodillas", tips: "Velocidad" },
    ],
  };
  return exercises[muscleGroup] || exercises.fullbody;
}

async function generateRoutineWithAI(userId, params) {
  const profile = await UserProfile.findOne({ where: { user_id: userId } });
  const { muscleGroup = 'fullbody', duration = 45, intensity = 'high', customPrompt } = params;

  const systemPrompt = `Genera una rutina de CALISTENIA variada.

PERFIL: Nivel ${profile?.experience_level || 'intermediate'}

REGLAS:
1. Incluye 4-5 bloques DIFERENTES: combina HIIT + AMRAP + STANDARD + REST
2. Enfócate en grupo muscular: ${muscleGroup}
3. Duración aproximada: ${duration} minutos
4. Cada bloque HIIT/AMRAP/EMOM DEBE tener "circuit_exercises" con 4-6 ejercicios

JSON OBLIGATORIO:
{
  "name": "Nombre Épico",
  "description": "Descripción",
  "difficulty_level": "intermediate",
  "estimated_duration": ${duration},
  "muscle_focus": "${muscleGroup}",
  "exercises": [
    {"name": "Warm-up", "exercise_type": "standard", "sets": 1, "reps": 10, "rest_time": 0},
    {"name": "HIIT Block", "exercise_type": "hiit", "hiit_work_time": 40, "hiit_rest_time": 20, "hiit_rounds": 8, "circuit_exercises": [...]},
    {"name": "AMRAP Block", "exercise_type": "amrap", "amrap_duration": 720, "circuit_exercises": [...]},
    {"name": "Strength", "exercise_type": "standard", "sets": 3, "reps": 10, "rest_time": 60},
    {"name": "Recovery", "exercise_type": "rest", "rest_time": 120}
  ]
}`;

  let userPrompt = customPrompt || `Genera rutina de ${muscleGroup} de ${duration} min`;

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
      max_tokens: 4000,
      temperature: 0.8
    })
  });

  const data = await response.json();
  let routineData;
  try {
    const cleanJson = data.choices[0]?.message?.content.replace(/```json\n?|\n?```/g, '').trim();
    routineData = JSON.parse(cleanJson);
  } catch (e) {
    throw new Error('Error parseando respuesta');
  }

  // Validar circuit_exercises
  routineData.exercises = routineData.exercises.map(ex => {
    if (['hiit', 'amrap', 'emom'].includes(ex.exercise_type)) {
      if (!ex.circuit_exercises || ex.circuit_exercises.length < 3) {
        ex.circuit_exercises = getDefaultCircuitExercises(muscleGroup);
      }
    }
    return ex;
  });

  const estimatedDuration = routineData.estimated_duration || calculateRoutineDuration(routineData.exercises);

  const routine = await Routine.create({
    user_id: userId,
    name: routineData.name,
    description: routineData.description,
    difficulty_level: routineData.difficulty_level,
    estimated_duration: estimatedDuration,
  });

  if (routineData.exercises?.length > 0) {
    await Exercise.bulkCreate(routineData.exercises.map((ex, i) => ({
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
      order_index: i + 1,
    })));
  }

  const fullRoutine = await Routine.findByPk(routine.id, {
    include: [{ model: Exercise, as: 'Exercises' }],
  });

  return { routine: fullRoutine, estimated_duration: estimatedDuration };
}

module.exports = { generateRoutineWithAI, calculateRoutineDuration, getDefaultCircuitExercises };