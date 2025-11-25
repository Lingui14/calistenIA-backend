const router = require('express').Router();
const auth = require('../middlewares/auth');
const { UserProfile, UserContext, Routine, Exercise } = require('../models');

const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';

// System prompt para el chat
const SYSTEM_PROMPT = `Eres CalistenIA, un coach de fitness experto y amigable.

COMPORTAMIENTO:
- Responde de forma conversacional y motivadora
- Adapta las rutinas a lo que el usuario pide
- Usa nombres COMUNES de ejercicios, nunca nombres épicos o inventados
- SIEMPRE responde algo útil, nunca dejes al usuario sin respuesta
- IMPORTANTE: Cuando el usuario te diga qué tipo de entrenamiento hace (halterofilia, crossfit, calistenia, pesas, etc.), USA la función update_training_context para guardarlo

CUANDO EL USUARIO MENCIONE SU TIPO DE ENTRENAMIENTO:
- Si dice "hago halterofilia" -> guarda training_focus: "weightlifting"
- Si dice "hago crossfit" -> guarda training_focus: "crossfit"  
- Si dice "hago calistenia" -> guarda training_focus: "calisthenics"
- Si dice "mezclo pesas y calistenia" -> guarda training_focus: "mixed"
- Si menciona ejercicios que le gustan -> guarda en preferred_exercises

CUANDO GENERES RUTINAS:
- Usa nombres claros: "Flexiones", "Sentadillas", "Clean and Jerk", "Snatch"
- Incluye descripción de cómo hacer cada ejercicio
- Adapta al tipo de entrenamiento del usuario (usa su training_focus)

IMPORTANTE - DESPUÉS DE GENERAR UNA RUTINA:
Incluye este patrón al final: [ROUTINE_BUTTON:ID]
Donde ID es el routine_id que recibiste.

REGLA CRÍTICA: SIEMPRE responde con algo útil. Si no entiendes la pregunta, pide aclaración. Nunca respondas vacío.`;

/**
 * Extrae JSON de una respuesta que puede tener markdown
 */
function extractJSON(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    // Limpiar markdown
    let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch (e2) {
      // Buscar JSON entre llaves
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
  
  // Determinar tipo de entrenamiento
  const trainingFocus = args.workout_type || context?.training_focus || 'mixed';
  
  let exerciseStyle = '';
  if (trainingFocus === 'weightlifting' || trainingFocus === 'halterofilia') {
    exerciseStyle = 'Incluye ejercicios olímpicos: Clean, Snatch, Jerk, Front Squat, Overhead Squat, Deadlift';
  } else if (trainingFocus === 'crossfit') {
    exerciseStyle = 'Mezcla ejercicios de halterofilia con calistenia y cardio: Thrusters, Wall Balls, Box Jumps, Burpees, Pull-ups';
  } else if (trainingFocus === 'mixed') {
    exerciseStyle = 'Mezcla ejercicios con peso (barra, mancuernas) y peso corporal';
  } else {
    exerciseStyle = 'Usa ejercicios de peso corporal: Flexiones, Dominadas, Sentadillas, Fondos';
  }

  const routinePrompt = `Genera una rutina de ejercicios con estas características:
- Nivel: ${args.difficulty || profile?.experience_level || 'intermediate'}
- Objetivo: ${args.goal || profile?.goal || 'fuerza general'}
- Tipo de entrenamiento preferido: ${trainingFocus}
- Ejercicios favoritos del usuario: ${JSON.stringify(context?.preferred_exercises || [])}
${args.custom_request ? `- Petición especial: ${args.custom_request}` : ''}

ESTILO DE EJERCICIOS:
${exerciseStyle}

REGLAS OBLIGATORIAS:
1. Usa NOMBRES COMUNES de ejercicios
2. Cada ejercicio DEBE tener una descripción clara
3. Incluye 4-6 ejercicios variados
4. Adapta al tipo de entrenamiento: ${trainingFocus}

RESPONDE SOLO CON JSON VÁLIDO (sin markdown, sin texto adicional):
{
  "name": "Rutina de [tipo] - [objetivo]",
  "description": "Descripción breve",
  "difficulty_level": "beginner|intermediate|advanced",
  "exercises": [
    {
      "name": "Nombre común del ejercicio",
      "description": "Posición inicial, movimiento y tips",
      "sets": 3,
      "reps": 10,
      "rest_time": 60,
      "exercise_type": "standard",
      "notes": "Variaciones opcionales"
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
          { role: 'system', content: 'Eres un experto en fitness. Genera rutinas personalizadas. Responde SOLO con JSON válido, sin markdown.' },
          { role: 'user', content: routinePrompt }
        ],
        max_tokens: 2500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      console.error('Error de Grok API:', await response.text());
      return { success: false, message: 'Error conectando con la IA' };
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || '';
    
    if (!content) {
      return { success: false, message: 'La IA no generó contenido' };
    }
    
    let routineData;
    try {
      routineData = extractJSON(content);
    } catch (parseErr) {
      console.error('Error parseando JSON de rutina:', content);
      return { success: false, message: 'Error procesando la rutina generada' };
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
      message: `Rutina "${routineData.name}" creada`,
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
    console.error('Error generando rutina con IA:', err);
    return { success: false, message: 'Error generando la rutina' };
  }
}

// Funciones disponibles para Grok
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
      message: 'Preferencias de entrenamiento guardadas',
      context: updates 
    };
  },

  get_profile: async (userId) => {
    const profile = await UserProfile.findOne({ where: { user_id: userId } });
    const context = await UserContext.findOne({ where: { user_id: userId } });
    
    return {
      success: true,
      profile: {
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
      routines: routines.map(r => ({
        id: r.id,
        name: r.name,
        difficulty: r.difficulty_level,
        exercises: r.Exercises?.map(e => e.name) || [],
      })),
    };
  },

  generate_routine: async (userId, args) => {
    return await generateRoutineWithAI(userId, args);
  },
};

// Definición de tools para Grok
const tools = [
  {
    type: 'function',
    function: {
      name: 'update_profile',
      description: 'Actualiza el perfil del usuario (nivel de experiencia, objetivo, días disponibles)',
      parameters: {
        type: 'object',
        properties: {
          experience: {
            type: 'string',
            enum: ['beginner', 'intermediate', 'advanced'],
            description: 'Nivel de experiencia del usuario',
          },
          goal: {
            type: 'string',
            enum: ['build_muscle', 'lose_weight', 'maintain', 'flexibility', 'strength'],
            description: 'Objetivo del usuario',
          },
          available_days: {
            type: 'number',
            description: 'Días disponibles para entrenar por semana (1-7)',
          },
          session_duration: {
            type: 'number',
            description: 'Duración de cada sesión en minutos',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_training_context',
      description: 'Actualiza las preferencias de entrenamiento del usuario. USA ESTA FUNCIÓN cuando el usuario mencione qué tipo de entrenamiento hace o qué ejercicios le gustan.',
      parameters: {
        type: 'object',
        properties: {
          training_focus: {
            type: 'string',
            enum: ['calisthenics', 'weightlifting', 'crossfit', 'mixed', 'bodybuilding', 'powerlifting'],
            description: 'Tipo principal de entrenamiento: calisthenics (peso corporal), weightlifting (halterofilia/olímpico), crossfit, mixed (mezcla de pesas y calistenia), bodybuilding, powerlifting',
          },
          preferred_exercises: {
            type: 'array',
            items: { type: 'string' },
            description: 'Lista de ejercicios favoritos del usuario',
          },
          avoided_exercises: {
            type: 'array',
            items: { type: 'string' },
            description: 'Ejercicios que el usuario quiere evitar',
          },
          preferred_intensity: {
            type: 'string',
            enum: ['low', 'moderate', 'high', 'extreme'],
            description: 'Intensidad preferida',
          },
          preferred_duration: {
            type: 'number',
            description: 'Duración preferida en minutos',
          },
          injuries: {
            type: 'array',
            items: { type: 'string' },
            description: 'Lesiones o limitaciones del usuario',
          },
          preferred_workout_types: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tipos de workout preferidos: strength, hiit, amrap, emom, circuit',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_profile',
      description: 'Obtiene el perfil y preferencias de entrenamiento del usuario',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_routines',
      description: 'Obtiene las rutinas del usuario',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_routine',
      description: 'Genera una nueva rutina de ejercicios personalizada',
      parameters: {
        type: 'object',
        properties: {
          difficulty: {
            type: 'string',
            enum: ['beginner', 'intermediate', 'advanced'],
          },
          goal: {
            type: 'string',
            description: 'Objetivo específico',
          },
          workout_type: {
            type: 'string',
            description: 'Tipo de entrenamiento (usa el training_focus del usuario si no se especifica)',
          },
          custom_request: {
            type: 'string',
            description: 'Petición específica del usuario',
          },
        },
      },
    },
  },
];

// Respuestas de fallback cuando algo falla
const FALLBACK_RESPONSES = [
  '¿Podrías reformular tu pregunta? Estoy aquí para ayudarte con rutinas, ejercicios, nutrición o técnica.',
  '¿En qué puedo ayudarte? Puedo crear rutinas personalizadas, resolver dudas sobre ejercicios o darte consejos de nutrición.',
  'Cuéntame más sobre lo que necesitas. ¿Quieres que genere una rutina, te explique un ejercicio o hablemos de nutrición?',
];

function getRandomFallback() {
  return FALLBACK_RESPONSES[Math.floor(Math.random() * FALLBACK_RESPONSES.length)];
}

router.post('/', auth, async (req, res) => {
  try {
    const { messages, model, max_tokens } = req.body;

    if (!process.env.REACT_APP_XAI_API_KEY) {
      console.error('API key no configurada');
      return res.json({ 
        choices: [{ 
          message: { 
            content: 'Hay un problema de configuración. Por favor contacta al soporte.' 
          } 
        }] 
      });
    }

    if (!messages || messages.length === 0) {
      return res.json({ 
        choices: [{ 
          message: { 
            content: '¡Hola! Soy CalistenIA, tu coach de fitness. ¿En qué puedo ayudarte hoy?' 
          } 
        }] 
      });
    }

    // Obtener contexto del usuario para incluirlo en el prompt
    const context = await UserContext.findOne({ where: { user_id: req.user.id } });
    
    const contextInfo = context ? `
CONTEXTO DEL USUARIO (GUARDADO):
- Tipo de entrenamiento: ${context.training_focus || 'no especificado'}
- Ejercicios favoritos: ${JSON.stringify(context.preferred_exercises || [])}
- Intensidad preferida: ${context.preferred_intensity || 'moderate'}
- Lesiones: ${JSON.stringify(context.injuries || [])}

USA ESTA INFORMACIÓN para personalizar las rutinas.` : '';

    const messagesWithSystem = [
      { role: 'system', content: SYSTEM_PROMPT + contextInfo },
      ...messages,
    ];

    console.log('Enviando mensaje a Grok...');

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
      console.error('Error de Grok API:', errorText);
      
      // Devolver respuesta de fallback en lugar de error
      return res.json({ 
        choices: [{ 
          message: { 
            content: getRandomFallback()
          } 
        }] 
      });
    }

    let data = await response.json();

    // Verificar si hay respuesta válida
    if (!data.choices || data.choices.length === 0) {
      console.error('Respuesta vacía de Grok:', data);
      return res.json({ 
        choices: [{ 
          message: { 
            content: getRandomFallback()
          } 
        }] 
      });
    }

    // Procesar tool calls si existen
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
          console.error('Error parseando argumentos:', parseErr);
          continue;
        }

        console.log(`Ejecutando función: ${functionName}`, args);

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
            console.error(`Error ejecutando ${functionName}:`, funcErr);
            toolResults.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              content: JSON.stringify({ success: false, message: 'Error ejecutando función' }),
            });
          }
        }
      }

      // Segunda llamada con resultados de las funciones
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
        
        // Agregar botón de rutina si se generó una
        if (generatedRoutineId) {
          let content = data.choices?.[0]?.message?.content || 'Rutina creada exitosamente.';
          
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

    // Verificar que la respuesta final tenga contenido
    const finalContent = data.choices?.[0]?.message?.content;
    
    if (!finalContent || finalContent.trim() === '') {
      console.error('Respuesta final vacía');
      return res.json({ 
        choices: [{ 
          message: { 
            content: getRandomFallback()
          } 
        }] 
      });
    }

    res.json(data);
    
  } catch (err) {
    console.error('Error en chat:', err);
    
    // NUNCA devolver error 500, siempre dar una respuesta
    res.json({ 
      choices: [{ 
        message: { 
          content: 'Tuve un problema técnico. ¿Puedes intentar de nuevo?' 
        } 
      }] 
    });
  }
});

module.exports = router;