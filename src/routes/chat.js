// src/routes/chat.js
const router = require('express').Router();
const auth = require('../middlewares/auth');
const { UserProfile, UserContext, TrainingSession, Routine, Exercise } = require('../models');

const XAI_API_KEY = process.env.REACT_APP_XAI_API_KEY;
const XAI_API_URL = 'https://api.x.ai/v1/chat/completions';

/**
 * Genera rutina de alto nivel estilo Navy SEAL con múltiples ejercicios en HIIT/AMRAP/EMOM
 */
async function generateEliteRoutine(userId, params) {
  const profile = await UserProfile.findOne({ where: { user_id: userId } });
  
  // Obtener historial reciente de entrenamientos
  const history = await TrainingSession.findAll({
    where: { user_id: userId },
    order: [['created_at', 'DESC']],
    limit: 5,
    include: [{ model: Routine, as: 'Routine' }]
  });

  const systemPrompt = `Genera una rutina de CALISTENIA de ÉLITE estilo entrenamiento militar Navy SEAL.

PERFIL: Nivel ${profile?.experience_level || 'intermediate'}, Equipo: ${JSON.stringify(profile?.available_equipment || ['ninguno'])}

HISTORIAL RECIENTE:
${history.length > 0 ? JSON.stringify(history.slice(0, 5), null, 2) : 'Sin entrenamientos registrados'}

REGLAS OBLIGATORIAS PARA EJERCICIOS HIIT/AMRAP/EMOM:
1. HIIT debe tener MÍNIMO 5-8 ejercicios diferentes (NO solo 1)
   - Ejemplo: Burpees, Mountain Climbers, Jump Squats, Push-ups, High Knees, etc.
   - Cada ejercicio se ejecuta durante el tiempo de trabajo especificado
   
2. AMRAP debe tener MÍNIMO 4-6 ejercicios en el circuito
   - Ejemplo: 10 Pull-ups, 20 Push-ups, 30 Squats, 40 Sit-ups, 50 Mountain Climbers
   - El usuario completa tantas rondas como pueda en el tiempo especificado
   
3. EMOM debe tener MÍNIMO 3-5 ejercicios rotando
   - Ejemplo: Minuto 1: 15 Burpees, Minuto 2: 20 Push-ups, Minuto 3: 25 Squats, repite
   
4. CADA ejercicio HIIT/AMRAP/EMOM debe incluir:
   - name: nombre del ejercicio específico
   - description: instrucciones detalladas de ejecución
   - notes: tips de forma y técnica

5. Formato de nombres:
   - HIIT: "HIIT Circuit: [nombre épico]" - luego lista los ejercicios
   - AMRAP: "AMRAP Challenge: [nombre épico]" - luego lista los ejercicios
   - EMOM: "EMOM Gauntlet: [nombre épico]" - luego lista los ejercicios

6. Enfoque en:
   - Explosividad y potencia
   - Resistencia mental
   - Ejercicios de cuerpo completo
   - Nombres ÉPICOS e inspiradores
   - Intensidad EXTREMA

FORMATO JSON (SIN MARKDOWN, SIN COMILLAS TRIPLES):
{
  "name": "NOMBRE ÉPICO DE LA RUTINA",
  "description": "Descripción motivadora estilo militar",
  "difficulty_level": "advanced",
  "exercises": [
    {
      "name": "HIIT Circuit: Hell Week Warrior",
      "description": "Circuito HIIT de alta intensidad con 6 ejercicios. Ejecuta cada ejercicio durante 40 segundos con 20 segundos de descanso. Completa 8 rondas del circuito completo.\n\n1. Burpees - explosión total del cuerpo\n2. Mountain Climbers - velocidad máxima\n3. Jump Squats - potencia de piernas\n4. Push-ups - pecho y tríceps\n5. High Knees - cardio intenso\n6. Plank Jacks - core estable",
      "exercise_type": "hiit",
      "sets": null,
      "reps": null,
      "rest_time": null,
      "amrap_duration": null,
      "hiit_work_time": 40,
      "hiit_rest_time": 20,
      "hiit_rounds": 8,
      "emom_duration": null,
      "notes": "Mantén la forma perfecta. Si fallas, toma 5 segundos y continúa. NO te detengas completamente."
    },
    {
      "name": "AMRAP Challenge: Death by Pull-ups",
      "description": "Completa tantas rondas como puedas en 20 minutos:\n\n1. 5 Pull-ups estrictos\n2. 10 Push-ups diamante\n3. 15 Pistol Squats (alternando)\n4. 20 Sit-ups explosivos\n5. 25 Burpees",
      "exercise_type": "amrap",
      "sets": null,
      "reps": null,
      "rest_time": null,
      "amrap_duration": 1200,
      "hiit_work_time": null,
      "hiit_rest_time": null,
      "hiit_rounds": null,
      "emom_duration": null,
      "notes": "Ritmo constante. Cada ronda completa cuenta. Objetivo: 5+ rondas."
    },
    {
      "name": "EMOM Gauntlet: Navy SEAL Destroyer",
      "description": "Cada minuto en el minuto por 15 minutos, rota estos ejercicios:\n\nMinuto 1: 15 Burpees\nMinuto 2: 20 Push-ups\nMinuto 3: 25 Air Squats\nMinuto 4: 30 Mountain Climbers\nMinuto 5: 10 Jump Lunges (cada pierna)\n\nRepite el ciclo 3 veces",
      "exercise_type": "emom",
      "sets": null,
      "reps": null,
      "rest_time": null,
      "amrap_duration": null,
      "hiit_work_time": null,
      "hiit_rest_time": null,
      "hiit_rounds": null,
      "emom_duration": 900,
      "notes": "Usa el tiempo restante del minuto para descansar. Si no terminas en el minuto, ajusta las reps."
    }
  ],
  "spotify_mood": "intense"
}`;

  const userPrompt = `Genera una rutina EXTREMA de calistenia estilo Navy SEAL.
Tipo: ${params.focus || 'hiit'}
Duración: ${params.duration || 45} minutos
Intensidad: ${params.intensity || 'extreme'}
${params.custom_request ? `\nPetición adicional: ${params.custom_request}` : ''}

CRÍTICO: Asegúrate de que CADA ejercicio HIIT/AMRAP/EMOM tenga MÚLTIPLES movimientos listados en la descripción (mínimo 4-8 ejercicios). NO generes ejercicios HIIT/AMRAP/EMOM con un solo movimiento.

Responde SOLO con el JSON de la rutina, SIN markdown, SIN texto adicional, SIN comillas triples.`;

  try {
    const response = await fetch(XAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'grok-beta',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.8,
        max_tokens: 2500,
      }),
    });

    if (!response.ok) {
      throw new Error(`Grok API error: ${response.status}`);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || '';
    
    // Limpiar markdown
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    const routineData = JSON.parse(content);

    // Crear rutina en la BD
    const routine = await Routine.create({
      user_id: userId,
      name: routineData.name,
      description: routineData.description,
      difficulty_level: routineData.difficulty_level,
      created_by_ai: true,
    });

    // Crear ejercicios
    if (routineData.exercises?.length > 0) {
      const exercisesData = routineData.exercises.map((ex, index) => ({
        routine_id: routine.id,
        name: ex.name,
        description: ex.description,
        exercise_type: ex.exercise_type,
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

// Funciones disponibles para el chat
const AVAILABLE_FUNCTIONS = [
  {
    name: 'generate_routine',
    description: 'Genera una rutina de entrenamiento estilo Navy SEAL/militar de alta intensidad con múltiples ejercicios en HIIT/AMRAP/EMOM',
    parameters: {
      type: 'object',
      properties: {
        focus: { 
          type: 'string', 
          enum: ['hiit', 'amrap', 'emom', 'strength', 'endurance', 'fullbody', 'push', 'pull', 'legs'],
          description: 'Tipo de entrenamiento - prioriza hiit, amrap o emom con múltiples ejercicios'
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
          description: 'Nivel de intensidad'
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
 * POST /api/chat/message
 * Envía mensaje al chat de Grok con function calling
 */
router.post('/message', auth, async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;

    if (!message) {
      return res.status(400).json({ message: 'Mensaje requerido' });
    }

    const profile = await UserProfile.findOne({ where: { user_id: req.user.id } });

    const systemPrompt = `Eres Karuna AI, un entrenador personal de élite experto en calistenia estilo Navy SEAL y meditación Vipassana.

PERSONALIDAD:
- Motivador intenso pero respetuoso
- Enfocado en resultados y disciplina
- Experto en entrenamientos de alta intensidad
- Guía espiritual para meditación

PERFIL DEL USUARIO:
${JSON.stringify(profile, null, 2)}

CAPACIDADES:
1. Generar rutinas épicas de calistenia con MÚLTIPLES EJERCICIOS en HIIT/AMRAP/EMOM
2. Consultar rutinas existentes
3. Ver perfil del usuario
4. Proporcionar guidance de meditación Vipassana

IMPORTANTE SOBRE RUTINAS:
- SIEMPRE genera rutinas con múltiples ejercicios en HIIT/AMRAP/EMOM
- HIIT: 5-8 ejercicios diferentes en el circuito
- AMRAP: 4-6 ejercicios en el circuito
- EMOM: 3-5 ejercicios rotando cada minuto

Cuando generes una rutina, SIEMPRE responde con:
"✅ Rutina generada: [NOMBRE DE LA RUTINA]

[DESCRIPCIÓN BREVE Y MOTIVADORA]

💪 [ROUTINE_BUTTON:ID_DE_LA_RUTINA]"

Reemplaza ID_DE_LA_RUTINA con el ID real que devuelve la función.`;

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
        model: 'grok-beta',
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
          model: 'grok-beta',
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

    // Respuesta normal sin function call
    res.json({
      reply: choice.message?.content || 'Lo siento, no pude generar una respuesta.',
    });

  } catch (err) {
    console.error('Error en /chat/message:', err);
    res.status(500).json({ message: err.message || 'Error procesando mensaje' });
  }
});

module.exports = router;