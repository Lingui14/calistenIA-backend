const router = require('express').Router();
const auth = require('../middlewares/auth');

const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';

router.post('/', auth, async (req, res) => {
  try {
    const { messages, model, max_tokens } = req.body;

    const response = await fetch(GROK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROK_API_KEY}`,
      },
      body: JSON.stringify({
        model: model || 'grok-4-fast-reasoning',
        messages: messages || [],
        max_tokens: max_tokens || 500,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Error de Grok:', data);
      return res.status(500).json({ error: data });
    }

    res.json(data);
  } catch (err) {
    console.error('Error en proxy:', err);
    res.status(500).json({ message: 'Error en el servidor' });
  }
});

module.exports = router;