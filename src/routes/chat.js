// src/routes/chat.js (CORREGIDO)
const router = require('express').Router();
const auth = require('../middlewares/auth');
const { UserProfile, Routine, Exercise, TrainingSession } = require('../models');

const XAI_API_KEY = process.env.REACT_APP_XAI_API_KEY;
const XAI_API_URL = 'https://api.x.ai/v1/chat/completions';

/**
 * Calcula duración estimada de una rutina
 */
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

/**
 * Genera ejercicios de circuito por defecto
 */
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

/**
 * Genera rutina con IA
 */
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

EJERCICIOS POR GRUPO:
- PUSH: Push-ups, Diamond Push-ups, Pike Push-ups, Dips, Archer Push-ups
- PULL: Pull-ups, Chin-ups, Australian Rows, Negative Pull-ups
- LEGS: Squats, Jump Squats, Lunges, Bulgarian Split Squats, Box Jumps
- CORE: Plank, V-ups, Leg Raises, Hollow Hold, Mountain Climbers
- FULLBODY: Burpees, Mountain Climbers, Jump Squats, Push-ups, High Knees

JSON OBLIGATORIO (sin markdown):
{
  "name": "Nombre Épico",
  "description": "Descripción motivadora",
  "difficulty_level": "intermediate",
  "estimated_duration": ${duration},
  "muscle_focus": "${muscleGroup}",
  "exercises": [
    {"name": "Warm-up", "exercise_type": "standard", "sets": 1, "reps": 10, "rest_time": 0},
    {"name": "HIIT Block", "exercise_type": "hiit", "hiit_work_time": 40, "hiit_rest_time": 20, "hiit_rounds": 8, "circuit_exercises": [{"name": "...", "reps": null, "duration": 40, "description": "...", "tips": "..."}]},
    {"name": "AMRAP Block", "exercise_type": "amrap", "amrap_duration": 720, "circuit_exercises": [{"name": "...", "reps": 10, "description": "...", "tips": "..."}]},
    {"name": "Strength", "exercise_type": "standard", "sets": 3, "reps": 10, "rest_time": 60},
    {"name": "Recovery", "exercise_type": "rest", "rest_time": 120}
  ]
}`;

  const userPrompt = customPrompt || `Genera rutina de ${muscleGroup} de ${duration} min, intensidad ${intensity}`;

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

  if (!response.ok) {
    throw new Error('Error de API Grok');
  }

  const data = await response.json();
  let routineData;
  
  try {
    const cleanJson = data.choices[0]?.message?.content.replace(/```json\n?|\n?```/g, '').trim();
    routineData = JSON.parse(cleanJson);
  } catch (e) {
    throw new Error('Error parseando respuesta de IA');
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

// Funciones disponibles para el chat
const AVAILABLE_FUNCTIONS = [
  {
    name: 'generate_routine',
    description: 'Genera una rutina de calistenia variada con múltiples bloques',
    parameters: {
      type: 'object',
      properties: {
        muscleGroup: { 
          type: 'string', 
          enum: ['push', 'pull', 'legs', 'core', 'fullbody'],
          description: 'Grupo muscular a trabajar'
        },
        duration: { 
          type: 'integer', 
          description: 'Duración en minutos (30-60)',
          default: 45
        },
        intensity: { 
          type: 'string', 
          enum: ['moderate', 'high', 'extreme'],
          default: 'high'
        },
        customRequest: { 
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
      properties: { limit: { type: 'integer', default: 5 } }
    }
  },
  {
    name: 'get_profile',
    description: 'Obtiene el perfil del usuario',
    parameters: { type: 'object', properties: {} }
  }
];

// src/routes/chat.js - AGREGAR ESTA RUTA AL INICIO (después de AVAILABLE_FUNCTIONS)

/**
 * POST /api/chat
 * Ruta compatible con el frontend original
 */
router.post('/', auth, async (req, res) => {
  try {
    const { messages: inputMessages } = req.body;
    
    if (!inputMessages || inputMessages.length === 0) {
      return res.status(400).json({ message: 'Mensajes requeridos' });
    }

    // Extraer el último mensaje del usuario
    const userMessages = inputMessages.filter(m => m.role === 'user');
    const lastUserMessage = userMessages[userMessages.length - 1]?.content;
    
    if (!lastUserMessage) {
      return res.status(400).json({ message: 'Mensaje de usuario requerido' });
    }

    // Obtener historial (todos menos el último)
    const conversationHistory = inputMessages.slice(0, -1);

    const profile = await UserProfile.findOne({ where: { user_id: req.user.id } });

    const systemPrompt = `Eres CalistenIA, un entrenador personal de élite experto en calistenia estilo Navy SEAL.

PERFIL DEL USUARIO:
${JSON.stringify(profile, null, 2)}

CAPACIDADES:
1. Generar rutinas épicas de calistenia (usa generate_routine)
2. Consultar rutinas existentes (usa get_routines)
3. Ver perfil del usuario (usa get_profile)

IMPORTANTE: Cuando el usuario pida una rutina, SIEMPRE usa la función generate_routine.
Después de generarla, responde con formato:
"✅ Rutina generada: [NOMBRE]

[DESCRIPCIÓN BREVE]

[ROUTINE_BUTTON:ID_DE_LA_RUTINA]"`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: lastUserMessage }
    ];

    const response = await fetch(XAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'grok-3-fast',
        messages: messages,
        functions: AVAILABLE_FUNCTIONS,
        function_call: 'auto',
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Grok API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];

    if (!choice) {
      throw new Error('No response from Grok');
    }

    // Si hay function call
    if (choice.message?.function_call) {
      const functionName = choice.message.function_call.name;
      const functionArgs = JSON.parse(choice.message.function_call.arguments);

      let functionResult;
      let generatedRoutineId = null;

      if (functionName === 'generate_routine') {
        const routineId = await generateEliteRoutine(req.user.id, functionArgs);
        generatedRoutineId = routineId;
        
        const routine = await Routine.findByPk(routineId, {
          include: [{ model: Exercise, as: 'Exercises' }]
        });

        functionResult = {
          success: true,
          routine_id: routineId,
          routine_name: routine.name,
          routine_description: routine.description,
          exercises_count: routine.Exercises?.length || 0
        };
      } else if (functionName === 'get_routines') {
        const routines = await Routine.findAll({
          where: { user_id: req.user.id },
          order: [['createdAt', 'DESC']],
          limit: functionArgs.limit || 5,
          include: [{ model: Exercise, as: 'Exercises' }]
        });

        functionResult = {
          routines: routines.map(r => ({
            id: r.id,
            name: r.name,
            description: r.description,
            exercises_count: r.Exercises?.length || 0
          }))
        };
      } else if (functionName === 'get_profile') {
        functionResult = { profile };
      }

      // Segunda llamada con el resultado de la función
      const secondResponse = await fetch(XAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${XAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'grok-3-fast',
          messages: [
            ...messages,
            choice.message,
            {
              role: 'function',
              name: functionName,
              content: JSON.stringify(functionResult),
            },
          ],
          temperature: 0.7,
        }),
      });

      const secondData = await secondResponse.json();
      let replyContent = secondData.choices?.[0]?.message?.content || 'Rutina generada correctamente';

      // Si se generó una rutina, asegurar que el botón esté presente
      if (generatedRoutineId && !replyContent.includes('[ROUTINE_BUTTON:')) {
        replyContent += `\n\n[ROUTINE_BUTTON:${generatedRoutineId}]`;
      }

      // Devolver en formato compatible con frontend original
      return res.json({
        choices: [{
          message: {
            content: replyContent
          }
        }],
        function_called: functionName,
        function_result: functionResult,
      });
    }

    // Respuesta normal sin function call - formato compatible
    res.json({
      choices: [{
        message: {
          content: choice.message?.content || 'Lo siento, no pude generar una respuesta.'
        }
      }]
    });


    // Respuesta normal sin function call
    res.json({ reply: choice.message?.content || 'Lo siento, no pude responder.' });

  } catch (err) {
    console.error('Error en /chat/message:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;