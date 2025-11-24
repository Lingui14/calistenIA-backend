// src/routes/chat.js
const router = require('express').Router();
const auth = require('../middlewares/auth');
const { UserProfile, UserContext, TrainingSession, Routine, Exercise } = require('../models');

const XAI_API_KEY = process.env.REACT_APP_XAI_API_KEY;
const XAI_API_URL = 'https://api.x.ai/v1/chat/completions';

/**
 * Genera rutina con MÚLTIPLES ejercicios individuales
 */
async function generateEliteRoutine(userId, params) {
  const profile = await UserProfile.findOne({ where: { user_id: userId } });

  const systemPrompt = `Genera una rutina de CALISTENIA estilo Navy SEAL.

PERFIL: Nivel ${profile?.experience_level || 'intermediate'}

REGLA CRÍTICA: Debes generar MÍNIMO 6-10 ejercicios INDIVIDUALES en el array "exercises".
NO generes un solo ejercicio con múltiples movimientos en la descripción.
CADA movimiento debe ser un ejercicio SEPARADO en el array.

EJEMPLO CORRECTO para AMRAP de 20 minutos:
{
  "exercises": [
    { "name": "Pull-ups", "exercise_type": "amrap", "reps": 5, "amrap_duration": 1200 },
    { "name": "Push-ups Diamante", "exercise_type": "amrap", "reps": 10, "amrap_duration": 1200 },
    { "name": "Pistol Squats", "exercise_type": "amrap", "reps": 8, "amrap_duration": 1200 },
    { "name": "Burpees", "exercise_type": "amrap", "reps": 10, "amrap_duration": 1200 },
    { "name": "Mountain Climbers", "exercise_type": "amrap", "reps": 20, "amrap_duration": 1200 }
  ]
}

EJEMPLO CORRECTO para HIIT:
{
  "exercises": [
    { "name": "Burpees", "exercise_type": "hiit", "hiit_work_time": 40, "hiit_rest_time": 20, "hiit_rounds": 8 },
    { "name": "Mountain Climbers", "exercise_type": "hiit", "hiit_work_time": 40, "hiit_rest_time": 20, "hiit_rounds": 8 },
    { "name": "Jump Squats", "exercise_type": "hiit", "hiit_work_time": 40, "hiit_rest_time": 20, "hiit_rounds": 8 },
    { "name": "Push-ups", "exercise_type": "hiit", "hiit_work_time": 40, "hiit_rest_time": 20, "hiit_rounds": 8 },
    { "name": "High Knees", "exercise_type": "hiit", "hiit_work_time": 40, "hiit_rest_time": 20, "hiit_rounds": 8 },
    { "name": "Plank Jacks", "exercise_type": "hiit", "hiit_work_time": 40, "hiit_rest_time": 20, "hiit_rounds": 8 }
  ]
}

FORMATO JSON (SIN MARKDOWN):
{
  "name": "NOMBRE ÉPICO",
  "description": "Descripción motivadora breve",
  "difficulty_level": "advanced",
  "exercises": [
    {
      "name": "Nombre del ejercicio individual",
      "description": "Cómo ejecutarlo correctamente",
      "exercise_type": "hiit|amrap|emom|standard",
      "sets": null,
      "reps": 10,
      "rest_time": null,
      "amrap_duration": 1200,
      "hiit_work_time": 40,
      "hiit_rest_time": 20,
      "hiit_rounds": 8,
      "emom_duration": null,
      "notes": "Tips de forma"
    }
  ]
}`;

  const userPrompt = `Genera una rutina EXTREMA estilo Navy SEAL.
Tipo: ${params.focus || 'hiit'}
Duración: ${params.duration || 45} minutos
Intensidad: ${params.intensity || 'extreme'}
${params.custom_request ? `Petición: ${params.custom_request}` : ''}

IMPORTANTE: Genera MÍNIMO 6 ejercicios INDIVIDUALES separados en el array. NO un solo ejercicio con lista en la descripción.

Responde SOLO con JSON válido.`;

  try {
    const response = await fetch(XAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'grok-4-fast-reasoning',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 3000,
      }),
    });

    if (!response.ok) {
      throw new Error(`Grok API error: ${response.status}`);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || '';
    
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    const routineData = JSON.parse(content);

    // Validar que tenga múltiples ejercicios
    if (!routineData.exercises || routineData.exercises.length < 3) {
      throw new Error('Rutina generada con muy pocos ejercicios');
    }

    const routine = await Routine.create({
      user_id: userId,
      name: routineData.name,
      description: routineData.description,
      difficulty_level: routineData.difficulty_level || 'advanced',
      created_by_ai: true,
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

    return routine.id;
  } catch (err) {
    console.error('Error generando rutina:', err);
    throw err;
  }
}

const AVAILABLE_FUNCTIONS = [
  {
    name: 'generate_routine',
    description: 'Genera una rutina de entrenamiento con múltiples ejercicios individuales',
    parameters: {
      type: 'object',
      properties: {
        focus: { 
          type: 'string', 
          enum: ['hiit', 'amrap', 'emom', 'strength', 'endurance', 'fullbody', 'push', 'pull', 'legs'],
        },
        duration: { 
          type: 'integer', 
          default: 45
        },
        intensity: { 
          type: 'string', 
          enum: ['high', 'extreme'],
          default: 'extreme',
        },
        custom_request: { 
          type: 'string', 
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

router.post('/message', auth, async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;

    if (!message) {
      return res.status(400).json({ message: 'Mensaje requerido' });
    }

    const profile = await UserProfile.findOne({ where: { user_id: req.user.id } });

    const systemPrompt = `Eres CalistenIA, entrenador personal de élite experto en calistenia.

PERSONALIDAD:
- Motivador intenso pero respetuoso
- Enfocado en resultados y disciplina
- Experto en HIIT, AMRAP, EMOM

PERFIL DEL USUARIO:
${JSON.stringify(profile, null, 2)}

CAPACIDADES:
1. Generar rutinas con MÚLTIPLES ejercicios individuales
2. Consultar rutinas existentes
3. Ver perfil del usuario

Responde de forma concisa y motivadora.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: message }
    ];

    const response = await fetch(XAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'grok-4-fast-reasoning',
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

      if (functionName === 'generate_routine') {
        const routineId = await generateEliteRoutine(req.user.id, functionArgs);
        
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

        // Para generate_routine, construimos la respuesta nosotros mismos
        // para asegurar que el ID sea correcto
        return res.json({
          reply: `Rutina generada: ${routine.name}\n\n${routine.description}\n\nEjercicios: ${routine.Exercises?.length || 0}\n\n[ROUTINE_BUTTON:${routineId}]`,
          function_called: functionName,
          function_result: functionResult,
        });

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

      // Segunda llamada para otras funciones
      const secondResponse = await fetch(XAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${XAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'grok-4-fast-reasoning',
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
      return res.json({
        reply: secondData.choices?.[0]?.message?.content || 'Error procesando respuesta',
        function_called: functionName,
        function_result: functionResult,
      });
    }

    res.json({
      reply: choice.message?.content || 'Lo siento, no pude generar una respuesta.',
    });

  } catch (err) {
    console.error('Error en /chat/message:', err);
    res.status(500).json({ message: err.message || 'Error procesando mensaje' });
  }
});

module.exports = router;