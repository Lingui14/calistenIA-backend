// src/routes/chat.js
const router = require('express').Router();
const auth = require('../middlewares/auth');
const { UserProfile, Routine, Exercise } = require('../models');
const { generateRoutineWithAI } = require('./routineGenerator');

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

async function executeFunction(functionName, args, userId) {
  switch (functionName) {
    case 'generate_routine': {
      const result = await generateRoutineWithAI(userId, {
        muscleGroup: args.focus || 'fullbody',
        duration: args.duration || 45,
        intensity: args.intensity || 'extreme',
        customPrompt: args.custom_request
      });
      return {
        routine_id: result.routine.id,
        routine_name: result.routine.name,
        exercises_count: result.routine.Exercises?.length || 0,
        estimated_duration: result.estimated_duration
      };
    }

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
        max_tokens: 1000
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
          max_tokens: 1000
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