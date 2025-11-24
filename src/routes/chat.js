// src/routes/chat.js
const router = require('express').Router();
const auth = require('../middlewares/auth');
const { UserProfile, Routine, Exercise } = require('../models');

const XAI_API_KEY = process.env.REACT_APP_XAI_API_KEY;
const XAI_API_URL = 'https://api.x.ai/v1/chat/completions';

// Importar la función de generación desde routines
const { generateRoutineWithAI } = require('./routineGenerator');

const AVAILABLE_FUNCTIONS = [
  {
    name: 'generate_routine',
    description: 'Genera una rutina de calistenia variada con múltiples bloques (HIIT, AMRAP, STANDARD, etc.)',
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

router.post('/message', auth, async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;
    if (!message) return res.status(400).json({ message: 'Mensaje requerido' });

    const profile = await UserProfile.findOne({ where: { user_id: req.user.id } });

    const systemPrompt = `Eres CalistenIA, un entrenador personal de élite experto en calistenia.

PERFIL DEL USUARIO:
${JSON.stringify(profile, null, 2)}

CAPACIDADES:
1. Generar rutinas variadas de calistenia (usa generate_routine)
2. Consultar rutinas existentes (usa get_routines)
3. Ver perfil del usuario (usa get_profile)
4. Responder preguntas sobre ejercicios y técnica

CUANDO GENERES UNA RUTINA:
- Usa la función generate_routine con los parámetros apropiados
- muscleGroup: push (pecho/triceps), pull (espalda/biceps), legs (piernas), core (abdomen), fullbody
- Después de generar, responde con el formato:
  "✅ Rutina generada: [NOMBRE]
  
  ⏱️ Duración: [X] minutos
  🎯 Enfoque: [GRUPO MUSCULAR]
  📊 Bloques: [CANTIDAD] ejercicios
  
  [DESCRIPCIÓN BREVE]
  
  💪 [ROUTINE_BUTTON:ID]"`;

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
        messages,
        functions: AVAILABLE_FUNCTIONS,
        function_call: 'auto',
        temperature: 0.7,
      }),
    });

    if (!response.ok) throw new Error('Error de API');

    const data = await response.json();
    const choice = data.choices?.[0];

    if (!choice) throw new Error('No response');

    // Si hay function call
    if (choice.message?.function_call) {
      const functionName = choice.message.function_call.name;
      const functionArgs = JSON.parse(choice.message.function_call.arguments);

      let functionResult;

      if (functionName === 'generate_routine') {
        // Usar la misma lógica que routines.js
        const result = await generateRoutineWithAI(req.user.id, {
          muscleGroup: functionArgs.muscleGroup || 'fullbody',
          duration: functionArgs.duration || 45,
          intensity: functionArgs.intensity || 'high',
          customPrompt: functionArgs.customRequest,
        });

        functionResult = {
          success: true,
          routine_id: result.routine.id,
          routine_name: result.routine.name,
          routine_description: result.routine.description,
          exercises_count: result.routine.Exercises?.length || 0,
          estimated_duration: result.estimated_duration,
          muscle_focus: functionArgs.muscleGroup || 'fullbody',
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
            id: r.id, name: r.name, exercises_count: r.Exercises?.length || 0
          }))
        };
      } else if (functionName === 'get_profile') {
        functionResult = { profile };
      }

      // Segunda llamada con resultado
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
            { role: 'function', name: functionName, content: JSON.stringify(functionResult) },
          ],
          temperature: 0.7,
        }),
      });

      const secondData = await secondResponse.json();
      return res.json({
        reply: secondData.choices?.[0]?.message?.content || 'Rutina generada correctamente',
        function_called: functionName,
        function_result: functionResult,
      });
    }

    res.json({ reply: choice.message?.content || 'Error' });

  } catch (err) {
    console.error('Error en /chat/message:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;