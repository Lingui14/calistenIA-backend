// src/routes/routines.js
const router = require('express').Router();
const auth = require('../middlewares/auth');
const { Routine, Exercise, UserProfile } = require('../models');

const XAI_API_KEY = process.env.REACT_APP_XAI_API_KEY;
const XAI_API_URL = 'https://api.x.ai/v1/chat/completions';

/**
 * POST /api/routines/generate-ai
 * Genera una rutina con IA de Grok
 */
router.post('/generate-ai', auth, async (req, res) => {
  try {
    const { customPrompt, workoutType, duration, intensity } = req.body;

    // Obtener perfil del usuario
    const profile = await UserProfile.findOne({ where: { user_id: req.user.id } });

    // Construir prompt para Grok
    const systemPrompt = `Eres un coach de fitness experto que genera rutinas personalizadas.

PERFIL USUARIO:
- Nivel: ${profile?.experience_level || 'intermediate'}
- Equipo: ${JSON.stringify(profile?.available_equipment || ['ninguno'])}

REGLAS OBLIGATORIAS:
1. Usa NOMBRES COMUNES y reconocibles para los ejercicios (ej: "Flexiones", "Sentadillas", "Dominadas", "Burpees")
2. NUNCA uses nombres épicos, inventados o metafóricos
3. Cada ejercicio DEBE tener una descripción clara de cómo ejecutarlo
4. Para HIIT: work 40s, rest 20s, rounds 8-12
5. Para AMRAP: duración 1200-2400 segundos (20-40 min)
6. Para EMOM: duración total en segundos (600-1800)
7. Incluye variedad: empuje, tracción, piernas, core

FORMATO DE DESCRIPCIÓN:
- Posición inicial
- Movimiento paso a paso  
- Tips de forma correcta

RESPONDE SOLO CON JSON VÁLIDO (sin markdown ni texto adicional):
{
  "name": "Rutina de [tipo] - [objetivo]",
  "description": "Descripción breve del objetivo",
  "difficulty_level": "beginner|intermediate|advanced",
  "exercises": [
    {
      "name": "Nombre común del ejercicio",
      "description": "Posición inicial: ... Ejecución: ... Tips: ...",
      "exercise_type": "standard|hiit|amrap|emom",
      "sets": 3,
      "reps": 10,
      "rest_time": 60,
      "amrap_duration": null,
      "hiit_work_time": null,
      "hiit_rest_time": null,
      "hiit_rounds": null,
      "emom_duration": null,
      "notes": "Variaciones opcionales"
    }
  ]
}`;

    let userPrompt = customPrompt || 'Genera una rutina balanceada de calistenia';
    if (workoutType) userPrompt += `. Tipo: ${workoutType}`;
    if (duration) userPrompt += `. Duración: ${duration} minutos`;
    if (intensity) userPrompt += `. Intensidad: ${intensity}`;

    console.log('🤖 Llamando a Grok...');

    // Llamar a Grok
    const response = await fetch(XAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${XAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'grok-4-fast-reasoning',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 2500,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Error de Grok:', error);
      throw new Error('Error generando rutina con IA');
    }

    const data = await response.json();
    const aiResponse = data.choices[0]?.message?.content;

    console.log('📝 Respuesta de Grok:', aiResponse);

    // Limpiar y parsear JSON
    let routineData;
    try {
      const cleanJson = aiResponse.replace(/```json\n?|\n?```/g, '').trim();
      routineData = JSON.parse(cleanJson);
    } catch (parseErr) {
      console.error('❌ Error parseando JSON:', aiResponse);
      throw new Error('La IA generó una respuesta inválida');
    }

    console.log('✅ Rutina parseada:', routineData);

    // Crear rutina en BD
    const routine = await Routine.create({
      user_id: req.user.id,
      name: routineData.name,
      description: routineData.description,
      difficulty_level: routineData.difficulty_level || 'intermediate',
    });

    console.log('💾 Rutina creada en BD:', routine.id);

    // Crear ejercicios
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
      console.log('✅ Ejercicios creados:', exercisesData.length);
    }

    // Devolver rutina completa
    const fullRoutine = await Routine.findByPk(routine.id, {
      include: [{ model: Exercise, as: 'Exercises' }],
    });

    res.json({
      routine: fullRoutine,
      spotify_mood: 'intense',
    });

  } catch (err) {
    console.error('❌ Error completo en /routines/generate-ai:', err);
    res.status(500).json({ 
      message: err.message || 'Error generando rutina',
      error: err.toString()
    });
  }
});

/**
 * GET /api/routines/ai-suggestions
 */
router.get('/ai-suggestions', auth, async (req, res) => {
  try {
    const suggestions = [
      { type: 'hiit', label: 'HIIT Intenso', description: 'Alta intensidad con intervalos' },
      { type: 'amrap', label: 'AMRAP', description: 'Máximas rondas posibles' },
      { type: 'fullbody', label: 'Full Body', description: 'Cuerpo completo' },
      { type: 'strength', label: 'Fuerza', description: 'Enfoque en fuerza' },
    ];
    res.json({ suggestions });
  } catch (err) {
    res.status(500).json({ message: 'Error obteniendo sugerencias' });
  }
});

/**
 * GET /api/routines/active
 */
router.get('/active', auth, async (req, res) => {
  try {
    const routine = await Routine.findOne({
      where: { user_id: req.user.id },
      order: [['createdAt', 'DESC']],
      include: [{ model: Exercise, as: 'Exercises' }],
    });
    res.json(routine || null);
  } catch (err) {
    console.error('Error obteniendo rutina activa:', err);
    res.status(500).json({ message: 'Error obteniendo rutina activa' });
  }
});

/**
 * GET /api/routines
 */
router.get('/', auth, async (req, res) => {
  try {
    const routines = await Routine.findAll({
      where: { user_id: req.user.id },
      order: [['createdAt', 'DESC']],
      include: [{ model: Exercise, as: 'Exercises' }],
    });
    res.json(routines);
  } catch (err) {
    console.error('Error obteniendo rutinas:', err);
    res.status(500).json({ message: 'Error obteniendo rutinas' });
  }
});

/**
 * POST /api/routines
 */
router.post('/', auth, async (req, res) => {
  try {
    const { name, description, difficulty_level, exercises } = req.body;

    const routine = await Routine.create({
      user_id: req.user.id,
      name,
      description,
      difficulty_level: difficulty_level || 'intermediate',
    });

    if (exercises?.length > 0) {
      const exercisesData = exercises.map((ex, index) => ({
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

    const fullRoutine = await Routine.findByPk(routine.id, {
      include: [{ model: Exercise, as: 'Exercises' }],
    });

    res.json(fullRoutine);
  } catch (err) {
    console.error('Error creando rutina:', err);
    res.status(500).json({ message: 'Error creando rutina' });
  }
});

/**
 * DELETE /api/routines/:id
 */
router.delete('/:id', auth, async (req, res) => {
  try {
    const routine = await Routine.findOne({
      where: { id: req.params.id, user_id: req.user.id },
    });

    if (!routine) {
      return res.status(404).json({ message: 'Rutina no encontrada' });
    }

    await Exercise.destroy({ where: { routine_id: routine.id } });
    await routine.destroy();

    res.json({ message: 'Rutina eliminada' });
  } catch (err) {
    console.error('Error eliminando rutina:', err);
    res.status(500).json({ message: 'Error eliminando rutina' });
  }
});

module.exports = router;