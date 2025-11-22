// src/routes/chat.js
const router = require('express').Router();
const auth = require('../middlewares/auth');
const { UserProfile, UserContext, Routine, Exercise } = require('../models');

const XAI_API_KEY = process.env.XAI_API_KEY;
const XAI_API_URL = 'https://api.x.ai/v1/chat/completions';

// Definición de funciones disponibles para el chat
const AVAILABLE_FUNCTIONS = [
  {
    name: 'get_profile',
    description: 'Obtiene el perfil y contexto actual del usuario',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'update_context',
    description: 'Actualiza las preferencias de entrenamiento del usuario',
    parameters: {
      type: 'object',
      properties: {
        training_focus: { type: 'string', enum: ['calisthenics', 'strength', 'mobility', 'skills', 'cardio'] },
        preferred_duration: { type: 'integer', description: 'Duración preferida en minutos' },
        preferred_intensity: { type: 'string', enum: ['low', 'moderate', 'high', 'extreme'] },
        preferred_workout_types: { type: 'array', items: { type: 'string' } },
        preferred_exercises: { type: 'array', items: { type: 'string' } },
        avoided_exercises: { type: 'array', items: { type: 'string' } },
        injuries: { type: 'array', items: { type: 'string' } }
      }
    }
  },
  {
    name: 'generate_routine',
    description: 'Genera una nueva rutina de entrenamiento personalizada',
    parameters: {
      type: 'object',
      properties: {
        workout_type: { type: 'string', enum: ['strength', 'amrap', 'hiit', 'emom', 'fullbody', 'push', 'pull', 'legs'] },
        duration: { type: 'integer', description: 'Duración en minutos' },
        intensity: { type: 'string', enum: ['low', 'moderate', 'high', 'extreme'] },
        custom_request: { type: 'string', description: 'Petición específica del usuario' }
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
  }
];

const SYSTEM_PROMPT = `Eres CalistenIA, un coach experto en calistenia y fitness.
Eres amigable, motivador y das consejos prácticos en español.

IMPORTANTE - USA LAS FUNCIONES cuando corresponda:
- Si el usuario pregunta por su perfil/nivel → usa get_profile
- Si quiere cambiar preferencias, ejercicios, lesiones → usa update_context  
- Si pide generar/crear una rutina → usa generate_routine
- Si pregunta por sus rutinas existentes → usa get_routines

Por defecto, asume siempre CALISTENIA (peso corporal) si no hay contexto específico.

Cuando generes una rutina con generate_routine, después de crearla responde con:
"¡Tu rutina está lista! 🎉 [ROUTINE_BUTTON:ID_DE_RUTINA]"

Esto mostrará un botón para ir a la rutina.`;

/**
 * Ejecuta las funciones llamadas por el modelo
 */
async function executeFunction(functionName, args, userId) {
  switch (functionName) {
    case 'get_profile': {
      const [profile, context] = await Promise.all([
        UserProfile.findOne({ where: { user_id: userId } }),
        UserContext.findOne({ where: { user_id: userId } })
      ]);
      return { profile, context };
    }

    case 'update_context': {
      let context = await UserContext.findOne({ where: { user_id: userId } });
      if (!context) {
        context = await UserContext.create({ user_id: userId, ...args });
      } else {
        await context.update(args);
      }
      return { success: true, context };
    }

    case 'generate_routine': {
      // Obtener perfil y contexto
      const [profile, context] = await Promise.all([
        UserProfile.findOne({ where: { user_id: userId } }),
        UserContext.findOne({ where: { user_id: userId } })
      ]);

      // Llamar a la API de generación
      const generatePrompt = buildRoutinePrompt(profile, context, args);
      
      const response = await fetch(XAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${XAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'grok-3-fast',
          messages: [
            { role: 'system', content: generatePrompt.system },
            { role: 'user', content: generatePrompt.user }
          ],
          max_tokens: 2000,
          temperature: 0.7
        })
      });

      const data = await response.json();
      const aiResponse = data.choices[0]?.message?.content;
      
      // Parsear y guardar rutina
      const cleanJson = aiResponse.replace(/```json\n?|\n?```/g, '').trim();
      const routineData = JSON.parse(cleanJson);

      const routine = await Routine.create({
        user_id: userId,
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

      return { 
        success: true, 
        routine_id: routine.id,
        routine_name: routine.name,
        exercises_count: routineData.exercises?.length || 0
      };
    }

    case 'get_routines': {
      const routines = await Routine.findAll({
        where: { user_id: userId },
        order: [['createdAt', 'DESC']],
        limit: args.limit || 5,
        include: [{ model: Exercise, as: 'Exercises' }]
      });
      return { routines: routines.map(r => ({ id: r.id, name: r.name, exercises: r.Exercises?.length })) };
    }

    default:
      return { error: 'Función no reconocida' };
  }
}

function buildRoutinePrompt(profile, context, args) {
  const system = `Genera una rutina de calistenia en formato JSON.
Nivel usuario: ${profile?.experience_level || 'beginner'}
Equipo: ${JSON.stringify(profile?.available_equipment || [])}
Lesiones a evitar: ${JSON.stringify(context?.injuries || [])}

RESPONDE SOLO CON JSON:
{
  "name": "Nombre",
  "description": "Descripción",
  "difficulty_level": "beginner|intermediate|advanced",
  "exercises": [
    {
      "name": "Ejercicio",
      "exercise_type": "standard|amrap|hiit",
      "sets": 3,
      "reps": 10,
      "rest_time": 60,
      "amrap_duration": null,
      "hiit_work_time": null,
      "hiit_rest_time": null,
      "hiit_rounds": null,
      "target_metric": "reps",
      "notes": ""
    }
  ]
}`;

  const user = `Genera rutina: tipo=${args.workout_type || 'fullbody'}, duración=${args.duration || 45}min, intensidad=${args.intensity || 'moderate'}. ${args.custom_request || ''}`;

  return { system, user };
}

/**
 * POST /api/chat
 * Endpoint principal del chat con function calling
 */
router.post('/', auth, async (req, res) => {
  try {
    const { messages } = req.body;

    // Primera llamada a Grok con tools
    const response = await fetch(XAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${XAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'grok-4-fast-reasoning',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages
        ],
        tools: AVAILABLE_FUNCTIONS.map(f => ({
          type: 'function',
          function: f
        })),
        tool_choice: 'auto',
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      throw new Error('Error comunicándose con Grok');
    }

    let data = await response.json();
    let assistantMessage = data.choices[0]?.message;

    // Si hay tool_calls, ejecutarlas
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      const toolResults = [];

      for (const toolCall of assistantMessage.tool_calls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments || '{}');
        
        const result = await executeFunction(functionName, functionArgs, req.user.id);
        toolResults.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          content: JSON.stringify(result)
        });
      }

      // Segunda llamada con resultados de las funciones
      const followUpResponse = await fetch(XAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${XAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'grok-4-fast-reasoning',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            ...messages,
            assistantMessage,
            ...toolResults
          ],
          max_tokens: 1000
        })
      });

      data = await followUpResponse.json();
      assistantMessage = data.choices[0]?.message;
    }

    res.json({
      choices: [{
        message: {
          role: 'assistant',
          content: assistantMessage.content
        }
      }]
    });

  } catch (err) {
    console.error('Error en /api/chat:', err);
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