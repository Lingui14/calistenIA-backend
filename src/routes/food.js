const router = require('express').Router();
const auth = require('../middlewares/auth');
const { FoodLog } = require('../models');
const { Op } = require('sequelize');

// GET /api/food/today - Comidas de hoy
router.get('/today', auth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const foods = await FoodLog.findAll({
      where: {
        user_id: req.user.id,
        logged_at: {
          [Op.gte]: today,
          [Op.lt]: tomorrow,
        },
      },
      order: [['logged_at', 'DESC']],
    });

    // Calcular totales del día
    const totals = foods.reduce(
      (acc, food) => ({
        calories: acc.calories + (food.calories || 0),
        protein: acc.protein + (food.protein || 0),
        carbs: acc.carbs + (food.carbs || 0),
        fat: acc.fat + (food.fat || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

    res.json({ foods, totals });
  } catch (err) {
    console.error('Error obteniendo comidas:', err);
    res.status(500).json({ message: 'Error obteniendo comidas' });
  }
});

// GET /api/food/history - Historial de comidas (últimos 7 días)
router.get('/history', auth, async (req, res) => {
  try {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const foods = await FoodLog.findAll({
      where: {
        user_id: req.user.id,
        logged_at: {
          [Op.gte]: weekAgo,
        },
      },
      order: [['logged_at', 'DESC']],
    });

    res.json(foods);
  } catch (err) {
    console.error('Error obteniendo historial:', err);
    res.status(500).json({ message: 'Error obteniendo historial' });
  }
});

// POST /api/food - Registrar comida
router.post('/', auth, async (req, res) => {
  try {
    const { name, calories, protein, carbs, fat, meal_type, notes } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'El nombre es requerido' });
    }

    const food = await FoodLog.create({
      user_id: req.user.id,
      name,
      calories: calories || 0,
      protein: protein || 0,
      carbs: carbs || 0,
      fat: fat || 0,
      meal_type: meal_type || 'snack',
      notes: notes || '',
      logged_at: new Date(),
    });

    res.json(food);
  } catch (err) {
    console.error('Error registrando comida:', err);
    res.status(500).json({ message: 'Error registrando comida' });
  }
});

// DELETE /api/food/:id - Eliminar comida
router.delete('/:id', auth, async (req, res) => {
  try {
    const food = await FoodLog.findOne({
      where: { id: req.params.id, user_id: req.user.id },
    });

    if (!food) {
      return res.status(404).json({ message: 'Comida no encontrada' });
    }

    await food.destroy();
    res.json({ message: 'Comida eliminada' });
  } catch (err) {
    console.error('Error eliminando comida:', err);
    res.status(500).json({ message: 'Error eliminando comida' });
  }
});

// src/routes/food.js - Agregar esta ruta al archivo existente

// POST /api/food/analyze - Analizar imagen de comida con IA
router.post('/analyze', auth, async (req, res) => {
  try {
    const { image } = req.body; // base64 string

    if (!image) {
      return res.status(400).json({ message: 'Imagen requerida' });
    }

    // Limpiar el base64 si viene con prefijo data:image
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');

    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'grok-vision-beta',
        messages: [
          {
            role: 'system',
            content: `Eres un nutricionista experto. Analiza la imagen de comida y responde SOLO con un JSON válido (sin markdown, sin backticks) con este formato exacto:
{
  "name": "nombre del plato en español",
  "calories": número estimado de calorías,
  "protein": gramos de proteína,
  "carbs": gramos de carbohidratos,
  "fat": gramos de grasa,
  "confidence": "alta" | "media" | "baja",
  "notes": "observaciones breves sobre la porción o ingredientes"
}

Si no puedes identificar comida en la imagen, responde:
{"error": "No se detectó comida en la imagen"}`
          },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Data}`,
                },
              },
              {
                type: 'text',
                text: 'Analiza esta comida y estima sus valores nutricionales.',
              },
            ],
          },
        ],
        max_tokens: 500,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Error de Grok:', errorData);
      return res.status(500).json({ message: 'Error al analizar imagen' });
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      return res.status(500).json({ message: 'Respuesta vacía de IA' });
    }

    // Parsear JSON de la respuesta
    try {
      const analysis = JSON.parse(content);
      
      if (analysis.error) {
        return res.status(400).json({ message: analysis.error });
      }

      res.json(analysis);
    } catch (parseErr) {
      console.error('Error parseando respuesta:', content);
      res.status(500).json({ message: 'Error procesando respuesta de IA' });
    }

  } catch (err) {
    console.error('Error analizando imagen:', err);
    res.status(500).json({ message: 'Error interno al analizar' });
  }
});

module.exports = router;