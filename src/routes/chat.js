const router = require('express').Router();
const auth = require('../middlewares/auth');
const { UserProfile, Routine, Exercise } = require('../models');

const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';

// System prompt para el chat
const SYSTEM_PROMPT = `Eres CalistenIA, un coach de fitness experto y amigable.

COMPORTAMIENTO:
- Responde de forma conversacional y motivadora
- Adapta las rutinas a lo que el usuario pide (calistenia, halterofilia, crossfit, etc.)
- Si el usuario menciona un deporte específico, incluye ejercicios de ese deporte
- Usa nombres COMUNES de ejercicios, nunca nombres épicos o inventados

CUANDO GENERES RUTINAS:
- Usa nombres claros: "Flexiones", "Sentadillas", "Press de banca", "Clean and Jerk"
- Incluye descripción de cómo hacer cada ejercicio
- Adapta la dificultad al nivel del usuario
- Si mencionan halterofilia/pesas: incluye ejercicios con barra y mancuernas
- Si mencionan calistenia: usa peso corporal
- Si no especifican: mezcla ambos`;

// Función para generar rutina con IA
async function generateRoutineWithAI(userId, args) {
  const profile = await UserProfile.findOne({ where: { user_id: userId } });
  
  const routinePrompt = `Genera una rutina de ejercicios con estas características:
- Nivel: ${args.difficulty || profile?.experience_level || 'intermediate'}
- Objetivo: ${args.goal || profile?.goal || 'fuerza general'}
- Tipo de entrenamiento: ${args.workout_type || 'mixto (calistenia y pesas)'}
${args.custom_request ? `- Petición especial: ${args.custom_request}` : ''}

REGLAS OBLIGATORIAS:
1. Usa NOMBRES COMUNES de ejercicios (ej: "Flexiones", "Sentadillas", "Press militar")
2. Cada ejercicio DEBE tener una descripción clara de cómo ejecutarlo
3. Incluye 4-6 ejercicios variados

RESPONDE SOLO CON JSON VÁLIDO (sin markdown ni texto adicional):
{
  "name": "Nombre descriptivo de la rutina",
  "description": "Objetivo de la rutina en 1 línea",
  "difficulty_level": "beginner|intermediate|advanced",
  "exercises": [
    {
      "name": "Nombre común del ejercicio",
      "description": "Posición inicial, movimiento y tips de forma",
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
          { role: 'system', content: 'Eres un experto en fitness. Genera rutinas con ejercicios claros y descripciones detalladas. Responde SOLO con JSON válido.' },
          { role: 'user', content: routinePrompt }
        ],
        max_tokens: 2000,
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || '';
    
    // Limpiar markdown si viene
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    const routineData = JSON.parse(content);

    // Crear rutina en BD
    const routine = await Routine.create({
      user_id: userId,
      name: routineData.name,
      description: routineData.description,
      difficulty_level: routineData.difficulty_level || 'intermediate',
    });

    // Crear ejercicios con descripciones
    if (routineData.exercises?.length > 0) {
      for (let i = 0; i < routineData.exercises.length; i++) {
        const ex = routineData.exercises[i];
        await Exercise.create({
          routine_id: routine.id,
          name: ex.name,
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

    // Obtener rutina completa
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

  get_profile: async (userId) => {
    const profile = await UserProfile.findOne({ where: { user_id: userId } });
    if (!profile) return { success: false, message: 'Perfil no encontrado' };
    return {
      success: true,
      profile: {
        experience: profile.experience_level,
        goal: profile.goal,
        available_days: profile.available_days,
        session_duration: profile.session_duration,
      },
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
      description: 'Actualiza el perfil del usuario (nivel de experiencia, objetivo, días disponibles, duración de sesión)',
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
      name: 'get_profile',
      description: 'Obtiene el perfil actual del usuario',
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
      description: 'Genera una nueva rutina de ejercicios personalizada para el usuario',
      parameters: {
        type: 'object',
        properties: {
          difficulty: {
            type: 'string',
            enum: ['beginner', 'intermediate', 'advanced'],
            description: 'Nivel de dificultad de la rutina',
          },
          goal: {
            type: 'string',
            description: 'Objetivo específico (fuerza, hipertrofia, resistencia)',
          },
          workout_type: {
            type: 'string',
            description: 'Tipo de entrenamiento (calistenia, halterofilia, crossfit, pesas, mixto)',
          },
          custom_request: {
            type: 'string',
            description: 'Petición específica del usuario sobre la rutina',
          },
        },
      },
    },
  },
];

router.post('/', auth, async (req, res) => {
  try {
    const { messages, model, max_tokens } = req.body;

    if (!process.env.REACT_APP_XAI_API_KEY) {
      return res.status(500).json({ message: 'API key no configurada' });
    }

    // Agregar system prompt al inicio
    const messagesWithSystem = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
    ];

    // Primera llamada a Grok
    const response = await fetch(GROK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.REACT_APP_XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: model || 'grok-4-fast-reasoning',
        messages: messagesWithSystem,
        max_tokens: max_tokens || 1000,
        tools: tools,
        tool_choice: 'auto',
      }),
    });

    let data = await response.json();

    if (!response.ok) {
      console.error('Error de Grok:', data);
      return res.status(500).json({ error: data });
    }

    // Si Grok quiere usar una función
    if (data.choices[0]?.message?.tool_calls) {
      const toolCalls = data.choices[0].message.tool_calls;
      const toolResults = [];

      for (const toolCall of toolCalls) {
        const functionName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments || '{}');

        console.log(`Ejecutando función: ${functionName}`, args);

        if (availableFunctions[functionName]) {
          const result = await availableFunctions[functionName](req.user.id, args);
          toolResults.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            content: JSON.stringify(result),
          });
        }
      }

      // Segunda llamada con resultados de las funciones
      const followUpMessages = [
        ...messagesWithSystem,
        data.choices[0].message,
        ...toolResults,
      ];

      const followUpResponse = await fetch(GROK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.REACT_APP_XAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: model || 'grok-4-fast-reasoning',
          messages: followUpMessages,
          max_tokens: max_tokens || 1000,
        }),
      });

      data = await followUpResponse.json();
      
      // Agregar el ID de rutina a la respuesta si se generó una
      const routineResult = toolResults.find(r => {
        const content = JSON.parse(r.content);
        return content.routine_id;
      });
      
      if (routineResult) {
        const content = JSON.parse(routineResult.content);
        return res.json({
          ...data,
          routine_id: content.routine_id,
        });
      }
    }

    res.json(data);
  } catch (err) {
    console.error('Error en chat:', err);
    res.status(500).json({ message: 'Error en el servidor' });
  }
});

module.exports = router;