const router = require('express').Router();
const auth = require('../middlewares/auth');
const { UserProfile, UserContext, Routine, Exercise } = require('../models');

const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';

// System prompt MEJORADO para el chat
const SYSTEM_PROMPT = `Eres CalistenIA, un coach de fitness experto y amigable que habla español.

REGLA PRINCIPAL: SIEMPRE intenta ayudar al usuario. NUNCA respondas pidiendo que reformule a menos que sea absolutamente imposible entender.

DETECCIÓN DE INTENCIONES - USA LAS FUNCIONES:

1. SI EL USUARIO PIDE UNA RUTINA (cualquier variación):
   - "hazme una rutina" -> USA generate_routine
   - "genera una rutina" -> USA generate_routine
   - "dame una rutina" -> USA generate_routine
   - "quiero una rutina" -> USA generate_routine
   - "mándame una rutina" -> USA generate_routine  
   - "rutina basada en mi perfil" -> USA generate_routine
   - "rutina personalizada" -> USA generate_routine
   - "entrenamiento para hoy" -> USA generate_routine
   - "qué puedo entrenar" -> USA generate_routine
   - "necesito ejercicios" -> USA generate_routine
   - Cualquier mención de "rutina" + petición -> USA generate_routine

2. SI EL USUARIO MENCIONA SU TIPO DE ENTRENAMIENTO:
   - "hago halterofilia/olimpico/weightlifting" -> USA update_training_context con training_focus: "weightlifting"
   - "hago crossfit" -> USA update_training_context con training_focus: "crossfit"
   - "hago calistenia/peso corporal" -> USA update_training_context con training_focus: "calisthenics"
   - "mezclo pesas y calistenia" -> USA update_training_context con training_focus: "mixed"
   - "hago gym/gimnasio/bodybuilding" -> USA update_training_context con training_focus: "bodybuilding"
   - "hago powerlifting/fuerza" -> USA update_training_context con training_focus: "powerlifting"

3. SI EL USUARIO PREGUNTA POR SUS RUTINAS:
   - "mis rutinas" -> USA get_routines
   - "qué rutinas tengo" -> USA get_routines
   - "muéstrame mis rutinas" -> USA get_routines

4. SI EL USUARIO PREGUNTA POR SU PERFIL:
   - "mi perfil" -> USA get_profile
   - "qué sabes de mí" -> USA get_profile

PARA TODO LO DEMÁS:
- Preguntas sobre ejercicios -> Responde directamente con información útil
- Preguntas sobre nutrición -> Responde directamente
- Preguntas sobre técnica -> Responde directamente
- Saludos -> Responde amablemente y pregunta en qué puedes ayudar
- Mensajes confusos -> Intenta interpretar la intención, no pidas reformular

ESTILO DE COMUNICACIÓN:
- Sé amigable y motivador
- Responde en español
- Sé conciso pero completo
- Usa nombres COMUNES de ejercicios

DESPUÉS DE GENERAR UNA RUTINA:
Incluye al final: [ROUTINE_BUTTON:ID]
Donde ID es el routine_id que recibiste.`;

/**
 * Extrae JSON de una respuesta que puede tener markdown
 */
function extractJSON(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch (e2) {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]);
      }
      throw new Error('No se pudo extraer JSON');
    }
  }
}

// Función para generar rutina con IA
async function generateRoutineWithAI(userId, args) {
  const profile = await UserProfile.findOne({ where: { user_id: userId } });
  const context = await UserContext.findOne({ where: { user_id: userId } });
  
  const trainingFocus = args.workout_type || context?.training_focus || 'mixed';
  
  let exerciseStyle = '';
  if (trainingFocus === 'weightlifting' || trainingFocus === 'halterofilia') {
    exerciseStyle = 'Incluye ejercicios olímpicos: Clean, Snatch, Jerk, Front Squat, Overhead Squat, Deadlift';
  } else if (trainingFocus === 'crossfit') {
    exerciseStyle = 'Mezcla ejercicios de halterofilia con calistenia y cardio: Thrusters, Wall Balls, Box Jumps, Burpees, Pull-ups';
  } else if (trainingFocus === 'mixed') {
    exerciseStyle = 'Mezcla ejercicios con peso (barra, mancuernas) y peso corporal';
  } else if (trainingFocus === 'bodybuilding') {
    exerciseStyle = 'Ejercicios de hipertrofia: Press banca, Curl biceps, Extensiones triceps, Elevaciones laterales';
  } else if (trainingFocus === 'powerlifting') {
    exerciseStyle = 'Enfoque en fuerza maxima: Sentadilla, Peso muerto, Press banca, con altas cargas';
  } else {
    exerciseStyle = 'Usa ejercicios de peso corporal: Flexiones, Dominadas, Sentadillas, Fondos';
  }

  const routinePrompt = `Genera una rutina de ejercicios:
- Nivel: ${args.difficulty || profile?.experience_level || 'intermediate'}
- Objetivo: ${args.goal || profile?.goal || 'fuerza general'}
- Tipo: ${trainingFocus}
- Ejercicios favoritos: ${JSON.stringify(context?.preferred_exercises || [])}
${args.custom_request ? `- Petición: ${args.custom_request}` : ''}

ESTILO: ${exerciseStyle}

RESPONDE SOLO CON JSON (sin markdown):
{
  "name": "Rutina de [tipo]",
  "description": "Descripción breve",
  "difficulty_level": "intermediate",
  "exercises": [
    {
      "name": "Nombre del ejercicio",
      "description": "Como hacerlo",
      "sets": 3,
      "reps": 10,
      "rest_time": 60,
      "exercise_type": "standard",
      "notes": ""
    }
  ]
}`;

  try {
    const response = await fetch(GROK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.REACT_APP_XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'grok-4-fast-reasoning',
        messages: [
          { role: 'system', content: 'Genera rutinas de ejercicio. Responde SOLO con JSON valido, sin markdown.' },
          { role: 'user', content: routinePrompt }
        ],
        max_tokens: 2500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      console.error('Error de Grok API en rutina');
      return { success: false, message: 'Error conectando con la IA' };
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || '';
    
    if (!content) {
      return { success: false, message: 'La IA no genero contenido' };
    }
    
    let routineData;
    try {
      routineData = extractJSON(content);
    } catch (parseErr) {
      console.error('Error parseando JSON:', content);
      return { success: false, message: 'Error procesando la rutina' };
    }

    const routine = await Routine.create({
      user_id: userId,
      name: routineData.name || 'Rutina personalizada',
      description: routineData.description || '',
      difficulty_level: routineData.difficulty_level || 'intermediate',
    });

    if (routineData.exercises?.length > 0) {
      for (let i = 0; i < routineData.exercises.length; i++) {
        const ex = routineData.exercises[i];
        await Exercise.create({
          routine_id: routine.id,
          name: ex.name || `Ejercicio ${i + 1}`,
          description: ex.description || '',
          sets: ex.sets || 3,
          reps: ex.reps || 10,
          rest_time: ex.rest_time || 60,
          exercise_type: ex.exercise_type || 'standard',
          notes: ex.notes || '',
          order_index: i,
        });
      }
    }

    const fullRoutine = await Routine.findByPk(routine.id, {
      include: [{ model: Exercise, as: 'Exercises' }],
    });

    return {
      success: true,
      message: `Rutina "${routineData.name}" creada con ${routineData.exercises?.length || 0} ejercicios`,
      routine_id: routine.id,
      routine: {
        id: fullRoutine.id,
        name: fullRoutine.name,
        description: fullRoutine.description,
        difficulty: fullRoutine.difficulty_level,
        exercises: fullRoutine.Exercises?.map(e => ({
          name: e.name,
          description: e.description,
          sets: e.sets,
          reps: e.reps,
        })),
      },
    };
  } catch (err) {
    console.error('Error generando rutina:', err);
    return { success: false, message: 'Error generando la rutina' };
  }
}

// Funciones disponibles
const availableFunctions = {
  update_profile: async (userId, args) => {
    const profile = await UserProfile.findOne({ where: { user_id: userId } });
    if (!profile) return { success: false, message: 'Perfil no encontrado' };

    const updates = {};
    if (args.experience) updates.experience_level = args.experience;
    if (args.goal) updates.goal = args.goal;
    if (args.available_days) updates.available_days = args.available_days;
    if (args.session_duration) updates.session_duration = args.session_duration;

    await profile.update(updates);
    return { success: true, message: 'Perfil actualizado', profile: updates };
  },

  update_training_context: async (userId, args) => {
    let context = await UserContext.findOne({ where: { user_id: userId } });
    
    if (!context) {
      context = await UserContext.create({ user_id: userId });
    }

    const updates = {};
    if (args.training_focus) updates.training_focus = args.training_focus;
    if (args.preferred_exercises) updates.preferred_exercises = args.preferred_exercises;
    if (args.avoided_exercises) updates.avoided_exercises = args.avoided_exercises;
    if (args.preferred_intensity) updates.preferred_intensity = args.preferred_intensity;
    if (args.preferred_duration) updates.preferred_duration = args.preferred_duration;
    if (args.injuries) updates.injuries = args.injuries;
    if (args.preferred_workout_types) updates.preferred_workout_types = args.preferred_workout_types;

    await context.update(updates);
    
    return { 
      success: true, 
      message: 'Preferencias guardadas',
      context: updates 
    };
  },

  get_profile: async (userId) => {
    const profile = await UserProfile.findOne({ where: { user_id: userId } });
    const context = await UserContext.findOne({ where: { user_id: userId } });
    
    return {
      success: true,
      profile: {
        name: profile?.full_name,
        experience: profile?.experience_level,
        goal: profile?.goal,
        available_days: profile?.available_days,
        session_duration: profile?.session_duration,
      },
      training_context: {
        training_focus: context?.training_focus,
        preferred_exercises: context?.preferred_exercises,
        preferred_intensity: context?.preferred_intensity,
        injuries: context?.injuries,
      }
    };
  },

  get_routines: async (userId) => {
    const routines = await Routine.findAll({
      where: { user_id: userId },
      include: [{ model: Exercise, as: 'Exercises' }],
      limit: 5,
      order: [['createdAt', 'DESC']],
    });
    return {
      success: true,
      count: routines.length,
      routines: routines.map(r => ({
        id: r.id,
        name: r.name,
        difficulty: r.difficulty_level,
        exercises_count: r.Exercises?.length || 0,
        exercises: r.Exercises?.map(e => e.name) || [],
      })),
    };
  },

  generate_routine: async (userId, args) => {
    return await generateRoutineWithAI(userId, args);
  },
};

// Tools para Grok
const tools = [
  {
    type: 'function',
    function: {
      name: 'generate_routine',
      description: 'Genera una rutina de ejercicios personalizada. USA ESTA FUNCION cuando el usuario pida: rutina, entrenamiento, ejercicios, workout, o cualquier variacion de "hazme/dame/genera/quiero una rutina".',
      parameters: {
        type: 'object',
        properties: {
          difficulty: {
            type: 'string',
            enum: ['beginner', 'intermediate', 'advanced'],
            description: 'Nivel de dificultad',
          },
          goal: {
            type: 'string',
            description: 'Objetivo (fuerza, hipertrofia, resistencia, etc)',
          },
          workout_type: {
            type: 'string',
            description: 'Tipo de entrenamiento',
          },
          custom_request: {
            type: 'string',
            description: 'Peticion especifica del usuario',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_training_context',
      description: 'Actualiza preferencias de entrenamiento. USA cuando el usuario diga que tipo de entrenamiento hace (halterofilia, crossfit, calistenia, gym, etc).',
      parameters: {
        type: 'object',
        properties: {
          training_focus: {
            type: 'string',
            enum: ['calisthenics', 'weightlifting', 'crossfit', 'mixed', 'bodybuilding', 'powerlifting'],
            description: 'Tipo principal de entrenamiento',
          },
          preferred_exercises: {
            type: 'array',
            items: { type: 'string' },
            description: 'Ejercicios favoritos',
          },
          avoided_exercises: {
            type: 'array',
            items: { type: 'string' },
            description: 'Ejercicios a evitar',
          },
          preferred_intensity: {
            type: 'string',
            enum: ['low', 'moderate', 'high', 'extreme'],
          },
          injuries: {
            type: 'array',
            items: { type: 'string' },
            description: 'Lesiones',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_profile',
      description: 'Obtiene el perfil del usuario. USA cuando pregunte sobre su perfil o que sabes de el.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_routines',
      description: 'Obtiene las rutinas guardadas del usuario. USA cuando pregunte por sus rutinas existentes.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_profile',
      description: 'Actualiza el perfil del usuario',
      parameters: {
        type: 'object',
        properties: {
          experience: {
            type: 'string',
            enum: ['beginner', 'intermediate', 'advanced'],
          },
          goal: {
            type: 'string',
            enum: ['build_muscle', 'lose_weight', 'maintain', 'flexibility', 'strength'],
          },
          available_days: { type: 'number' },
          session_duration: { type: 'number' },
        },
      },
    },
  },
];

router.post('/', auth, async (req, res) => {
  try {
    const { messages, model, max_tokens } = req.body;

    if (!process.env.REACT_APP_XAI_API_KEY) {
      console.error('API key no configurada');
      return res.json({ 
        choices: [{ message: { content: 'Hay un problema de configuracion. Contacta al soporte.' } }] 
      });
    }

    if (!messages || messages.length === 0) {
      return res.json({ 
        choices: [{ message: { content: 'Hola! Soy CalistenIA, tu coach de fitness. ¿En que puedo ayudarte? Puedo generarte rutinas personalizadas, resolver dudas sobre ejercicios o nutricion.' } }] 
      });
    }

    // Obtener contexto del usuario
    const profile = await UserProfile.findOne({ where: { user_id: req.user.id } });
    const context = await UserContext.findOne({ where: { user_id: req.user.id } });
    
    const userInfo = `
INFORMACION DEL USUARIO:
- Nombre: ${profile?.full_name || 'Usuario'}
- Nivel: ${profile?.experience_level || 'intermediate'}
- Objetivo: ${profile?.goal || 'mejorar condicion fisica'}
- Tipo de entrenamiento: ${context?.training_focus || 'no especificado'}
- Ejercicios favoritos: ${JSON.stringify(context?.preferred_exercises || [])}
- Lesiones: ${JSON.stringify(context?.injuries || [])}

USA ESTA INFORMACION para personalizar las rutinas.`;

    const messagesWithSystem = [
      { role: 'system', content: SYSTEM_PROMPT + userInfo },
      ...messages,
    ];

    console.log('Enviando a Grok:', messages[messages.length - 1]?.content);

    const response = await fetch(GROK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.REACT_APP_XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: model || 'grok-4-fast-reasoning',
        messages: messagesWithSystem,
        max_tokens: max_tokens || 1500,
        tools: tools,
        tool_choice: 'auto',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error de Grok:', errorText);
      return res.json({ 
        choices: [{ message: { content: 'Tuve un problema conectando. ¿Puedes intentar de nuevo?' } }] 
      });
    }

    let data = await response.json();

    if (!data.choices || data.choices.length === 0) {
      console.error('Respuesta vacia de Grok');
      return res.json({ 
        choices: [{ message: { content: 'No recibi respuesta. ¿Que necesitas? Puedo crear rutinas, responder dudas de ejercicios o nutricion.' } }] 
      });
    }

    // Procesar tool calls
    if (data.choices[0]?.message?.tool_calls) {
      const toolCalls = data.choices[0].message.tool_calls;
      const toolResults = [];
      let generatedRoutineId = null;

      for (const toolCall of toolCalls) {
        const functionName = toolCall.function.name;
        let args = {};
        
        try {
          args = JSON.parse(toolCall.function.arguments || '{}');
        } catch (parseErr) {
          console.error('Error parseando args:', parseErr);
          continue;
        }

        console.log('Ejecutando:', functionName, args);

        if (availableFunctions[functionName]) {
          try {
            const result = await availableFunctions[functionName](req.user.id, args);
            
            if (functionName === 'generate_routine' && result.routine_id) {
              generatedRoutineId = result.routine_id;
            }
            
            toolResults.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              content: JSON.stringify(result),
            });
          } catch (funcErr) {
            console.error(`Error en ${functionName}:`, funcErr);
            toolResults.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              content: JSON.stringify({ success: false, message: 'Error ejecutando funcion' }),
            });
          }
        }
      }

      // Segunda llamada con resultados
      if (toolResults.length > 0) {
        const followUpMessages = [
          ...messagesWithSystem,
          data.choices[0].message,
          ...toolResults,
        ];

        try {
          const followUpResponse = await fetch(GROK_API_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.REACT_APP_XAI_API_KEY}`,
            },
            body: JSON.stringify({
              model: model || 'grok-4-fast-reasoning',
              messages: followUpMessages,
              max_tokens: max_tokens || 1500,
            }),
          });

          if (followUpResponse.ok) {
            data = await followUpResponse.json();
          }
        } catch (followUpErr) {
          console.error('Error en follow-up:', followUpErr);
        }
        
        // Agregar boton de rutina
        if (generatedRoutineId) {
          let content = data.choices?.[0]?.message?.content || 'Rutina creada exitosamente!';
          
          if (!content.includes('[ROUTINE_BUTTON:')) {
            content += `\n\n[ROUTINE_BUTTON:${generatedRoutineId}]`;
            if (data.choices?.[0]?.message) {
              data.choices[0].message.content = content;
            }
          }
          
          return res.json({
            ...data,
            routine_id: generatedRoutineId,
          });
        }
      }
    }

    // Verificar respuesta final
    const finalContent = data.choices?.[0]?.message?.content;
    
    if (!finalContent || finalContent.trim() === '') {
      return res.json({ 
        choices: [{ message: { content: 'Estoy aqui para ayudarte! ¿Quieres que te genere una rutina de entrenamiento?' } }] 
      });
    }

    res.json(data);
    
  } catch (err) {
    console.error('Error en chat:', err);
    res.json({ 
      choices: [{ message: { content: 'Tuve un problema tecnico. ¿Puedes intentar de nuevo?' } }] 
    });
  }
});

module.exports = router;