// src/routes/chat.js (COMPLETO Y CORREGIDO)
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
- Inspirado en entrenamientos militares de élite

CAPACIDADES - USA LAS FUNCIONES cuando corresponda:
- Cuando el usuario pida generar/crear una rutina → SIEMPRE usa la función generate_routine
- Cuando pregunten por sus rutinas → usa get_routines
- Cuando quieran ver su perfil → usa get_profile

ESTILO DE RUTINAS:
- SIEMPRE prioriza HIIT, AMRAP, Tabata, y circuitos de alta intensidad
- Inspiración: Navy SEAL Hell Week, CrossFit Hero WODs, entrenamiento militar
- Enfoque: Explosividad, resistencia mental, capacidad funcional
- Incluye ejercicios compuestos y de cuerpo completo
- Nombres motivadores e intensos para las rutinas

IMPORTANTE: Cuando generes una rutina con la función, responde así:
"¡Tu rutina está lista! [ROUTINE_BUTTON:ROUTINE_ID]"`;

// Funciones disponibles para el chat
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
          description: 'Tipo de entrenamiento - SIEMPRE prioriza hiit o amrap'
        },
        duration: { 
          type: 'integer', 
          description: 'Duración en minutos (30-60)',
          default: 45
        },
        intensity: { 
          type: 'string', 
          enum: ['high', 'extreme'],
          default: 'extreme',
          description: 'Nivel de intensidad - SIEMPRE usa extreme o high'
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

/**
 * Genera rutina de alto nivel estilo Navy SEAL
 */
async function generateEliteRoutine(userId, params) {
  const profile = await UserProfile.findOne({ where: { user_id: userId } });

  const systemPrompt = `Genera una rutina de CALISTENIA de ÉLITE estilo entrenamiento militar Navy SEAL.

PERFIL: Nivel ${profile?.experience_level || 'intermediate'}, Equipo: ${JSON.stringify(profile?.available_equipment || ['ninguno'])}

REGLAS OBLIGATORIAS:
1. SIEMPRE incluye al menos 60% de ejercicios tipo HIIT o AMRAP
2. Enfoque en explosividad, resistencia mental y capacidad funcional
3. Ejercicios de cuerpo completo y compuestos
4. Nombres ÉPICOS e inspiradores
5. Intensidad EXTREMA
6. Incluye al menos 3-4 ejercicios HIIT/AMRAP por rutina
7. Tiempos de descanso CORTOS (30-45 segundos máximo)

TIPOS DE EJERCICIOS:
- HIIT: work 40s, rest 20s, rounds 8-12
- AMRAP: duración 1200-2400 segundos (20-40 min)
- Standard: solo para calentamiento/enfriamiento

FORMATO JSON (SIN MARKDOWN):
{
  "name": "NOMBRE ÉPICO DE LA RUTINA",
  "description": "Descripción motivadora estilo militar",
  "difficulty_level": "advanced",
  "exercises": [
    {
      "name": "Nombre del ejercicio",
      "description": "Instrucciones precisas",
      "exercise_type": "hiit|amrap|standard",
      "sets": 3,
      "reps": 10,
      "rest_time": 30,
      "amrap_duration": 1200,
      "hiit_work_time": 40,
      "hiit_rest_time": 20,
      "hiit_rounds": 8,
      "notes": "Tips de forma"
    }
  ],
  "spotify_mood": "intense"
}`;

  const userPrompt = `Genera una rutina EXTREMA de calistenia estilo Navy SEAL.
Tipo: ${params.focus || 'hiit'}
Duración: ${params.duration || 45} minutos
${params.custom_request ? `Petición: ${params.custom_request}` : ''}

RECUERDA: Mínimo 60% HIIT/AMRAP, nombres épicos, intensidad máxima.`;

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
      max_tokens: 2500,
      temperature: 0.8
    })
  });

  if (!response.ok) {
    throw new Error('Error generando rutina con Grok');
  }

  const data = await response.json();
  const aiResponse = data.choices[0]?.message?.content;

  // Parsear respuesta
  const cleanJson = aiResponse.replace(/```json\n?|\n?```/g, '').trim();
  const routineData = JSON.parse(cleanJson);

  // Crear rutina en BD
  const routine = await Routine.create({
    user_id: userId,
    name: routineData.name,
    description: routineData.description,
    difficulty_level: routineData.difficulty_level || 'advanced',
  });

  // Crear ejercicios
  if (routineData.exercises?.length > 0) {
    const exercisesData = routineData.exercises.map((ex, index) => ({
      routine_id: routine.id,
      name: ex.name,
      description: ex.description || '',
      exercise_type: ex.exercise_type || 'standard',
      sets: ex.sets || 3,
      reps: ex.reps || 10,
      rest_time: ex.rest_time || 30,
      amrap_duration: ex.amrap_duration,
      hiit_work_time: ex.hiit_work_time,
      hiit_rest_time: ex.hiit_rest_time,
      hiit_rounds: ex.hiit_rounds,
      notes: ex.notes || '',
      order_index: index + 1,
    }));

    await Exercise.bulkCreate(exercisesData);
  }

  return {
    routine_id: routine.id,
    routine_name: routine.name,
    spotify_mood: routineData.spotify_mood || 'intense',
    exercises_count: routineData.exercises?.length || 0
  };
}

/**
 * Ejecuta funciones
 */
async function executeFunction(functionName, args, userId) {
  switch (functionName) {
    case 'generate_routine':
      return await generateEliteRoutine(userId, args);

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

/**
 * POST /api/chat
 * Chat principal con function calling
 */
router.post('/', auth, async (req, res) => {
  try {
    const { messages } = req.body;

    // Primera llamada a Grok
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
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      throw new Error('Error con Grok');
    }

    let data = await response.json();
    let assistantMessage = data.choices[0]?.message;
    let generatedRoutineId = null;

    // Si hay tool_calls, ejecutarlos
    if (assistantMessage.tool_calls?.length > 0) {
      const toolResults = [];

      for (const toolCall of assistantMessage.tool_calls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments || '{}');

        const result = await executeFunction(functionName, functionArgs, req.user.id);
        
        // Guardar el ID de la rutina si se generó una
        if (functionName === 'generate_routine' && result.routine_id) {
          generatedRoutineId = result.routine_id;
        }

        toolResults.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          content: JSON.stringify(result)
        });
      }

      // Segunda llamada con resultados
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
          max_tokens: 1000
        })
      });

      data = await followUpResponse.json();
      assistantMessage = data.choices[0]?.message;
    }

    // CORRECCIÓN: Reemplazar placeholder con ID real
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