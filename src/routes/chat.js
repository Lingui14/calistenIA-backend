// src/routes/chat.js
const router = require('express').Router();
const auth = require('../middlewares/auth');
const { UserProfile, Routine, Exercise } = require('../models');

const REACT_APP_XAI_API_KEY = process.env.REACT_APP_XAI_API_KEY;
const XAI_API_URL = 'https://api.x.ai/v1/chat/completions';

const SYSTEM_PROMPT = `Eres CalistenIA, un coach militar de élite especializado en calistenia de alto rendimiento estilo Navy SEAL.

PERSONALIDAD:
- Eres motivador, exigente pero justo
- Usas lenguaje directo y profesional
- Enfocado en resultados y superación personal

CAPACIDADES - USA LAS FUNCIONES cuando corresponda:
- Cuando el usuario pida generar/crear una rutina → SIEMPRE usa la función generate_routine
- Cuando pregunten por sus rutinas → usa get_routines
- Cuando quieran ver su perfil → usa get_profile

IMPORTANTE: Cuando generes una rutina con la función, responde así:
"¡Tu rutina está lista! [ROUTINE_BUTTON:ROUTINE_ID]"`;

const AVAILABLE_FUNCTIONS = [
  {
    name: 'generate_routine',
    description: 'Genera una rutina de entrenamiento estilo Navy SEAL/militar de alta intensidad',
    parameters: {
      type: 'object',
      properties: {
        focus: { 
          type: 'string', 
          enum: ['hiit', 'amrap', 'strength', 'endurance', 'fullbody', 'push', 'pull', 'legs'],
          description: 'Tipo de entrenamiento'
        },
        duration: { 
          type: 'integer', 
          description: 'Duración en minutos (30-60)',
          default: 45
        },
        intensity: { 
          type: 'string', 
          enum: ['high', 'extreme'],
          default: 'extreme'
        },
        custom_request: { 
          type: 'string', 
          description: 'Petición específica del usuario' 
        }
      }
    }
  },
  {
    name: 'get_routines',
    description: 'Obtiene las rutinas del usuario',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'integer', default: 5 }
      }
    }
  },
  {
    name: 'get_profile',
    description: 'Obtiene el perfil del usuario',
    parameters: { type: 'object', properties: {} }
  }
];

// ========== COPIADO DE routines.js ==========

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

async function generateRoutineForChat(userId, params) {
  const profile = await UserProfile.findOne({ where: { user_id: userId } });
  const muscleGroup = params.focus || 'fullbody';
  const duration = params.duration || 45;

  const systemPrompt = `Eres un coach experto en calistenia estilo Navy SEAL.

PERFIL: Nivel ${profile?.experience_level || 'intermediate'}

REGLAS:
1. Incluye 4-5 bloques DIFERENTES: combina HIIT + AMRAP + STANDARD + REST
2. Enfócate en grupo muscular: ${muscleGroup}
3. Duración aproximada: ${duration} minutos
4. Cada bloque HIIT/AMRAP/EMOM DEBE tener "circuit_exercises" con 4-6 ejercicios

JSON OBLIGATORIO (sin markdown):
{
  "name": "Nombre Épico",
  "description": "Descripción",
  "difficulty_level": "intermediate",
  "estimated_duration": ${duration},
  "exercises": [
    {"name": "Warm-up", "exercise_type": "standard", "sets": 1, "reps": 10, "rest_time": 0},
    {"name": "HIIT Block", "exercise_type": "hiit", "hiit_work_time": 40, "hiit_rest_time": 20, "hiit_rounds": 8, "circuit_exercises": [{"name": "Burpees", "reps": null, "duration": 40}]},
    {"name": "AMRAP Block", "exercise_type": "amrap", "amrap_duration": 720, "circuit_exercises": [{"name": "Push-ups", "reps": 10}]},
    {"name": "Strength", "exercise_type": "standard", "sets": 3, "reps": 10, "rest_time": 60},
    {"name": "Recovery", "exercise_type": "rest", "rest_time": 120}
  ]
}`;

  const userPrompt = params.custom_request || `Genera rutina de ${muscleGroup} de ${duration} min. Responde SOLO con JSON válido.`;

  console.log('🤖 Chat: Generando rutina...');

  const response = await fetch(XAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${REACT_APP_XAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'grok-4-fast-reasoning',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 1000000,
      temperature: 0.8
    })
  });

  if (!response.ok) {
    throw new Error('Error con Grok API');
  }

  const data = await response.json();
  const aiResponse = data.choices[0]?.message?.content;

  let routineData;
  try {
    const cleanJson = aiResponse.replace(/```json\n?|\n?```/g, '').trim();
    routineData = JSON.parse(cleanJson);
  } catch (parseErr) {
    console.error('❌ Error parseando JSON:', aiResponse?.substring(0, 200));
    throw new Error('La IA generó una respuesta inválida');
  }

  // Validar circuit_exercises
  if (routineData.exercises) {
    routineData.exercises = routineData.exercises.map(ex => {
      if (['hiit', 'amrap', 'emom'].includes(ex.exercise_type)) {
        if (!ex.circuit_exercises || ex.circuit_exercises.length < 3) {
          ex.circuit_exercises = getDefaultCircuitExercises(muscleGroup);
        }
      }
      return ex;
    });
  }

  const estimatedDuration = routineData.estimated_duration || calculateRoutineDuration(routineData.exercises);

  const routine = await Routine.create({
    user_id: userId,
    name: routineData.name,
    description: routineData.description,
    difficulty_level: routineData.difficulty_level || 'intermediate',
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

  console.log('✅ Chat: Rutina creada ID:', routine.id);

  return {
    routine_id: routine.id,
    routine_name: routine.name,
    exercises_count: fullRoutine.Exercises?.length || 0,
    estimated_duration: estimatedDuration
  };
}

// ========== FIN COPIADO ==========

async function executeFunction(functionName, args, userId) {
  switch (functionName) {
    case 'generate_routine':
      return await generateRoutineForChat(userId, args);

    case 'get_routines': {
      const routines = await Routine.findAll({
        where: { user_id: userId },
        order: [['createdAt', 'DESC']],
        limit: args.limit || 5,
        include: [{ model: Exercise, as: 'Exercises' }]
      });
      return { 
        routines: routines.map(r => ({ 
          id: r.id, 
          name: r.name, 
          exercises: r.Exercises?.length 
        })) 
      };
    }

    case 'get_profile': {
      const profile = await UserProfile.findOne({ where: { user_id: userId } });
      return { profile };
    }

    default:
      return { error: 'Función no reconocida' };
  }
}

router.post('/', auth, async (req, res) => {
  try {
    const { messages } = req.body;

    const response = await fetch(XAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${REACT_APP_XAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'grok-4-fast-reasoning',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages
        ],
        tools: AVAILABLE_FUNCTIONS.map(f => ({ type: 'function', function: f })),
        tool_choice: 'auto',
        max_tokens: 1000000
      })
    });

    if (!response.ok) {
      throw new Error('Error con Grok');
    }

    let data = await response.json();
    let assistantMessage = data.choices[0]?.message;
    let generatedRoutineId = null;

    if (assistantMessage.tool_calls?.length > 0) {
      const toolResults = [];

      for (const toolCall of assistantMessage.tool_calls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments || '{}');

        const result = await executeFunction(functionName, functionArgs, req.user.id);
        
        if (functionName === 'generate_routine' && result.routine_id) {
          generatedRoutineId = result.routine_id;
        }

        toolResults.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          content: JSON.stringify(result)
        });
      }

      const followUpResponse = await fetch(XAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${REACT_APP_XAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'grok-4-fast-reasoning',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            ...messages,
            assistantMessage,
            ...toolResults
          ],
          max_tokens: 10000000
        })
      });

      data = await followUpResponse.json();
      assistantMessage = data.choices[0]?.message;
    }

    let content = assistantMessage.content || '';
    if (generatedRoutineId) {
      content = content.replace(/\[ROUTINE_BUTTON:[^\]]*\]/gi, `[ROUTINE_BUTTON:${generatedRoutineId}]`);
      if (!content.includes('[ROUTINE_BUTTON:')) {
        content += `\n\n[ROUTINE_BUTTON:${generatedRoutineId}]`;
      }
    }

    res.json({
      choices: [{
        message: {
          role: 'assistant',
          content: content
        }
      }]
    });

  } catch (err) {
    console.error('Error en chat:', err);
    res.status(500).json({ 
      choices: [{
        message: {
          role: 'assistant',
          content: 'Lo siento, hubo un error. Intenta de nuevo.'
        }
      }]
    });
  }
});

module.exports = router;