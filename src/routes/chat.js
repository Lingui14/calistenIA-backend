const router = require('express').Router();
const auth = require('../middlewares/auth');
const { UserProfile, Routine, Exercise } = require('../models');

const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';

// Funciones disponibles para Grok
const availableFunctions = {
  // Actualizar perfil del usuario
  update_profile: async (userId, args) => {
    const profile = await UserProfile.findOne({ where: { user_id: userId } });
    if (!profile) return { success: false, message: 'Perfil no encontrado' };

    const updates = {};
    if (args.experience) updates.experience = args.experience;
    if (args.goal) updates.goal = args.goal;
    if (args.available_days) updates.available_days = args.available_days;
    if (args.session_duration) updates.session_duration = args.session_duration;

    await profile.update(updates);
    return { success: true, message: 'Perfil actualizado', profile: updates };
  },

  // Obtener perfil actual
  get_profile: async (userId) => {
    const profile = await UserProfile.findOne({ where: { user_id: userId } });
    if (!profile) return { success: false, message: 'Perfil no encontrado' };
    return {
      success: true,
      profile: {
        experience: profile.experience,
        goal: profile.goal,
        available_days: profile.available_days,
        session_duration: profile.session_duration,
      },
    };
  },

  // Obtener rutinas del usuario
  get_routines: async (userId) => {
    const routines = await Routine.findAll({
      where: { user_id: userId },
      include: [{ model: Exercise, as: 'Exercises' }],
      limit: 5,
    });
    return {
      success: true,
      routines: routines.map(r => ({
        name: r.name,
        difficulty: r.difficulty_level,
        exercises: r.Exercises?.map(e => e.name) || [],
      })),
    };
  },

  // Generar nueva rutina
  generate_routine: async (userId, args) => {
    const profile = await UserProfile.findOne({ where: { user_id: userId } });
    
    const difficulty = args.difficulty || profile?.experience || 'beginner';
    const goal = args.goal || profile?.goal || 'general';

    // Ejercicios según nivel
    const exercisesByLevel = {
      beginner: [
        { name: 'Flexiones de rodillas', sets: 3, reps: 10, rest_time: 60 },
        { name: 'Sentadillas asistidas', sets: 3, reps: 12, rest_time: 60 },
        { name: 'Plancha', sets: 3, reps: 20, rest_time: 45 },
        { name: 'Puente de glúteos', sets: 3, reps: 15, rest_time: 45 },
      ],
      intermediate: [
        { name: 'Flexiones diamante', sets: 4, reps: 12, rest_time: 60 },
        { name: 'Sentadillas búlgaras', sets: 3, reps: 10, rest_time: 75 },
        { name: 'Dominadas australianas', sets: 4, reps: 10, rest_time: 60 },
        { name: 'Dips en banco', sets: 3, reps: 12, rest_time: 60 },
        { name: 'Plancha lateral', sets: 3, reps: 30, rest_time: 45 },
      ],
      advanced: [
        { name: 'Flexiones archer', sets: 4, reps: 8, rest_time: 90 },
        { name: 'Pistol squats', sets: 3, reps: 6, rest_time: 90 },
        { name: 'Dominadas', sets: 4, reps: 10, rest_time: 90 },
        { name: 'Dips en paralelas', sets: 4, reps: 12, rest_time: 75 },
        { name: 'L-sit', sets: 3, reps: 15, rest_time: 60 },
        { name: 'Muscle up negativas', sets: 3, reps: 5, rest_time: 120 },
      ],
    };

    const exercises = exercisesByLevel[difficulty] || exercisesByLevel.beginner;

    const routine = await Routine.create({
      user_id: userId,
      name: `Rutina ${difficulty} - ${goal}`,
      description: `Rutina generada por CalistenIA para nivel ${difficulty}`,
      difficulty_level: difficulty,
    });

    for (let i = 0; i < exercises.length; i++) {
      await Exercise.create({
        routine_id: routine.id,
        ...exercises[i],
        order_index: i,
      });
    }

    const fullRoutine = await Routine.findByPk(routine.id, {
      include: [{ model: Exercise, as: 'Exercises' }],
    });

    return {
      success: true,
      message: `Rutina ${difficulty} creada`,
      routine: {
        id: fullRoutine.id,
        name: fullRoutine.name,
        difficulty: fullRoutine.difficulty_level,
        exercises: fullRoutine.Exercises?.map(e => ({
          name: e.name,
          sets: e.sets,
          reps: e.reps,
        })),
      },
    };
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
      description: 'Genera una nueva rutina de ejercicios para el usuario',
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
            description: 'Objetivo específico de la rutina',
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

    // Primera llamada a Grok
    const response = await fetch(GROK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.REACT_APP_XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: model || 'grok-4-fast-reasoning',
        messages: messages || [],
        max_tokens: max_tokens || 500,
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
        ...messages,
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
          max_tokens: max_tokens || 500,
        }),
      });

      data = await followUpResponse.json();
    }

    res.json(data);
  } catch (err) {
    console.error('Error en chat:', err);
    res.status(500).json({ message: 'Error en el servidor' });
  }
});

module.exports = router;