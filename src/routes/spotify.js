// src/routes/spotify.js
const router = require('express').Router();
const auth = require('../middlewares/auth');
const { UserContext } = require('../models');

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

// Usamos HTTPS para el redirect de Spotify, luego redirigimos a la app
const SPOTIFY_REDIRECT_URI = 'https://calistenia-backend-production-6e8f.up.railway.app/api/spotify/callback-web';

/**
 * GET /api/spotify/auth-url
 * Genera URL de autorización de Spotify
 */
router.get('/auth-url', auth, (req, res) => {
  try {
    if (!SPOTIFY_CLIENT_ID) {
      console.error('SPOTIFY_CLIENT_ID no configurado');
      return res.status(500).json({ message: 'Spotify no está configurado' });
    }

    const scopes = [
      'user-read-private',
      'user-read-email',
      'playlist-read-private',
      'user-top-read',
      'user-library-read'
    ].join(' ');

    // Guardamos el user_id en el state para recuperarlo después
    const state = req.user.id;

    const authUrl = `https://accounts.spotify.com/authorize?` +
      `client_id=${SPOTIFY_CLIENT_ID}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(SPOTIFY_REDIRECT_URI)}` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&state=${state}`;

    console.log('Spotify auth URL generada');
    console.log('Redirect URI:', SPOTIFY_REDIRECT_URI);
    
    res.json({ url: authUrl });
  } catch (err) {
    console.error('Error generando auth URL:', err);
    res.status(500).json({ message: 'Error generando URL de autorización' });
  }
});

/**
 * GET /api/spotify/callback-web
 * Callback HTTPS para Spotify - redirige a la app móvil
 */
router.get('/callback-web', async (req, res) => {
  const { code, error, state } = req.query;
  
  console.log('Callback web recibido:', { code: code ? 'SI' : 'NO', error, state });
  
  if (error) {
    return res.send(`
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: -apple-system, sans-serif; background: #000; color: #fff; 
                   display: flex; align-items: center; justify-content: center; 
                   height: 100vh; margin: 0; text-align: center; }
            .container { padding: 20px; }
            h1 { color: #ff4444; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Error</h1>
            <p>${error}</p>
            <p>Puedes cerrar esta ventana.</p>
          </div>
        </body>
      </html>
    `);
  }
  
  if (code) {
    // Redirigir a la app móvil con el código
    const appUrl = `calistenia://spotify-callback?code=${code}&state=${state || ''}`;
    
    return res.send(`
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <meta http-equiv="refresh" content="1;url=${appUrl}">
          <style>
            body { font-family: -apple-system, sans-serif; background: #000; color: #fff; 
                   display: flex; align-items: center; justify-content: center; 
                   height: 100vh; margin: 0; text-align: center; }
            .container { padding: 20px; }
            .spinner { width: 40px; height: 40px; border: 3px solid #333; 
                       border-top-color: #fff; border-radius: 50%; 
                       animation: spin 1s linear infinite; margin: 0 auto 20px; }
            @keyframes spin { to { transform: rotate(360deg); } }
            a { color: #1DB954; text-decoration: none; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="spinner"></div>
            <h2>Conectando...</h2>
            <p>Redirigiendo a CalistenIA</p>
            <p style="margin-top: 20px; font-size: 14px; color: #888;">
              Si no se abre automaticamente, <a href="${appUrl}">toca aqui</a>
            </p>
          </div>
        </body>
      </html>
    `);
  }
  
  res.send(`
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: -apple-system, sans-serif; background: #000; color: #fff; 
                 display: flex; align-items: center; justify-content: center; 
                 height: 100vh; margin: 0; text-align: center; }
        </style>
      </head>
      <body>
        <div>
          <h1>Error</h1>
          <p>No se recibio codigo de autorizacion</p>
        </div>
      </body>
    </html>
  `);
});

/**
 * POST /api/spotify/callback
 * Intercambia código por tokens (llamado desde la app)
 */
router.post('/callback', auth, async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ message: 'Código no proporcionado' });
    }

    console.log('Intercambiando código por tokens...');

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: SPOTIFY_REDIRECT_URI
      })
    });

    const data = await response.json();

    if (data.error) {
      console.error('Error de Spotify:', data);
      throw new Error(data.error_description || 'Error de Spotify');
    }

    // Guardar tokens
    let context = await UserContext.findOne({ where: { user_id: req.user.id } });
    if (!context) {
      context = await UserContext.create({ user_id: req.user.id });
    }

    await context.update({
      spotify_access_token: data.access_token,
      spotify_refresh_token: data.refresh_token,
      spotify_token_expires: new Date(Date.now() + data.expires_in * 1000)
    });

    console.log('Spotify conectado exitosamente');
    res.json({ success: true });
  } catch (err) {
    console.error('Error en Spotify callback:', err);
    res.status(500).json({ message: err.message || 'Error conectando con Spotify' });
  }
});

/**
 * POST /api/spotify/disconnect
 */
router.post('/disconnect', auth, async (req, res) => {
  try {
    const context = await UserContext.findOne({ where: { user_id: req.user.id } });
    
    if (context) {
      await context.update({
        spotify_access_token: null,
        spotify_refresh_token: null,
        spotify_token_expires: null,
      });
    }
    
    console.log('Spotify desconectado');
    res.json({ success: true });
  } catch (err) {
    console.error('Error desconectando Spotify:', err);
    res.status(500).json({ message: 'Error desconectando Spotify' });
  }
});

/**
 * GET /api/spotify/playlists
 */
router.get('/playlists', auth, async (req, res) => {
  try {
    const { mood } = req.query;
    const context = await UserContext.findOne({ where: { user_id: req.user.id } });

    // FALLBACK: Si no hay Spotify conectado
    if (!context?.spotify_access_token) {
      return res.json({ playlists: getFallbackPlaylists(mood) });
    }

    // Verificar si token expiró
    if (new Date() > new Date(context.spotify_token_expires)) {
      try {
        const refreshResponse = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')
          },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: context.spotify_refresh_token
          })
        });

        const refreshData = await refreshResponse.json();
        
        if (refreshData.error) {
          await context.update({
            spotify_access_token: null,
            spotify_refresh_token: null,
            spotify_token_expires: null,
          });
          return res.json({ playlists: getFallbackPlaylists(mood) });
        }

        await context.update({
          spotify_access_token: refreshData.access_token,
          spotify_token_expires: new Date(Date.now() + refreshData.expires_in * 1000)
        });
      } catch (refreshErr) {
        console.error('Error refrescando token:', refreshErr);
        return res.json({ playlists: getFallbackPlaylists(mood) });
      }
    }

    const moodMap = {
      energetic: 'workout pop',
      focused: 'electronic focus',
      intense: 'workout hardcore',
      calm: 'chill stretching'
    };

    const searchQuery = moodMap[mood] || 'workout';

const searchResponse = await fetch(
  `https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery)}&type=playlist&limit=5`,
  {
    headers: {
      'Authorization': `Bearer ${context.spotify_access_token}`
    }
  }
);

console.log('Spotify search response status:', searchResponse.status);

if (!searchResponse.ok) {
  const errorText = await searchResponse.text();
  console.error('Spotify search error:', errorText);
  return res.json({ playlists: getFallbackPlaylists(mood) });
}

const searchData = await searchResponse.json();

    if (searchData.error) {
      return res.json({ playlists: getFallbackPlaylists(mood) });
    }

    const playlists = searchData.playlists?.items
      ?.filter(p => p !== null)
      ?.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        image: p.images?.[0]?.url,
        uri: p.uri,
        external_url: p.external_urls?.spotify,
        tracks_total: p.tracks?.total
      })) || [];

    res.json({ playlists: playlists.length > 0 ? playlists : getFallbackPlaylists(mood) });
  } catch (err) {
    console.error('Error obteniendo playlists:', err);
    res.json({ playlists: getFallbackPlaylists() });
  }
});

function getFallbackPlaylists(mood = 'intense') {
  const fallback = {
    intense: [
      { name: 'Beast Mode', external_url: 'https://open.spotify.com/playlist/37i9dQZF1DX76Wlfdnj7AP', tracks_total: 50 },
      { name: 'Power Workout', external_url: 'https://open.spotify.com/playlist/37i9dQZF1DX32NsLKyzScr', tracks_total: 60 },
    ],
    energetic: [
      { name: 'Energy Boost', external_url: 'https://open.spotify.com/playlist/37i9dQZF1DXdxcBWuJkbcy', tracks_total: 48 },
    ],
    focused: [
      { name: 'Deep Focus', external_url: 'https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ', tracks_total: 55 },
    ],
    calm: [
      { name: 'Peaceful Piano', external_url: 'https://open.spotify.com/playlist/37i9dQZF1DX4sWSpwq3LiO', tracks_total: 35 },
    ],
  };
  return fallback[mood] || fallback.intense;
}

/**
 * GET /api/spotify/status
 */
router.get('/status', auth, async (req, res) => {
  try {
    const context = await UserContext.findOne({ where: { user_id: req.user.id } });
    
    const isConnected = !!(context?.spotify_access_token && 
      context?.spotify_token_expires && 
      new Date() < new Date(context.spotify_token_expires));
    
    res.json({ 
      connected: isConnected,
      expires: context?.spotify_token_expires 
    });
  } catch (err) {
    res.json({ connected: false });
  }
});

/**
 * POST /api/spotify/music-chat
 * Mini-chat para buscar música con IA
 */
router.post('/music-chat', auth, async (req, res) => {
  try {
    const { message } = req.body;
    const context = await UserContext.findOne({ where: { user_id: req.user.id } });

    if (!message) {
      return res.status(400).json({ message: 'Mensaje requerido' });
    }

    // Si no hay Spotify conectado, devolver fallback
    if (!context?.spotify_access_token) {
      return res.json({ 
        playlists: [],
        aiMessage: 'Conecta tu Spotify primero para buscar playlists personalizadas.',
        needsConnection: true
      });
    }

    // Verificar/refrescar token
    if (new Date() > new Date(context.spotify_token_expires)) {
      try {
        const refreshResponse = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')
          },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: context.spotify_refresh_token
          })
        });

        const refreshData = await refreshResponse.json();
        
        if (refreshData.error) {
          return res.json({ 
            playlists: [],
            aiMessage: 'Tu sesión de Spotify expiró. Reconecta tu cuenta.',
            needsConnection: true
          });
        }

        await context.update({
          spotify_access_token: refreshData.access_token,
          spotify_token_expires: new Date(Date.now() + refreshData.expires_in * 1000)
        });
      } catch (refreshErr) {
        return res.json({ 
          playlists: [],
          aiMessage: 'Error refrescando sesión de Spotify.',
          needsConnection: true
        });
      }
    }

    // Usar IA para interpretar el mensaje y generar búsqueda
    const aiPrompt = `El usuario quiere música para entrenar y dice: "${message}"

Interpreta lo que quiere y genera 2-3 términos de búsqueda para Spotify.

RESPONDE SOLO CON JSON (sin markdown):
{
  "searchTerms": ["término 1", "término 2"],
  "response": "Mensaje corto y amigable sobre lo que vas a buscar (máximo 20 palabras)"
}

Ejemplos:
- "rock psicodélico" -> ["psychedelic rock workout", "progressive rock gym"]
- "algo como Daft Punk" -> ["daft punk workout", "electronic dance gym", "french house fitness"]
- "música latina para cardio" -> ["reggaeton workout", "latin cardio", "salsa fitness"]`;

    let searchTerms = [message + ' workout']; // Fallback
    let aiMessage = `Buscando "${message}"...`;

    try {
      const aiResponse = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.REACT_APP_XAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'grok-3-fast',
          messages: [
            { role: 'system', content: 'Eres un experto en música. Responde SOLO con JSON válido.' },
            { role: 'user', content: aiPrompt }
          ],
          max_tokens: 300,
          temperature: 0.7,
        }),
      });

      if (aiResponse.ok) {
        const aiData = await aiResponse.json();
        const content = aiData.choices?.[0]?.message?.content || '';
        
        // Extraer JSON
        let parsed;
        try {
          parsed = JSON.parse(content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim());
        } catch (e) {
          const match = content.match(/\{[\s\S]*\}/);
          if (match) parsed = JSON.parse(match[0]);
        }

        if (parsed?.searchTerms?.length > 0) {
          searchTerms = parsed.searchTerms;
          aiMessage = parsed.response || aiMessage;
        }
      }
    } catch (aiErr) {
      console.error('Error con IA:', aiErr);
      // Continuar con fallback
    }

    // Buscar en Spotify con cada término
    const allPlaylists = [];
    const seenIds = new Set();

    for (const term of searchTerms.slice(0, 3)) {
      try {
        const searchResponse = await fetch(
          `https://api.spotify.com/v1/search?q=${encodeURIComponent(term)}&type=playlist&limit=4`,
          {
            headers: {
              'Authorization': `Bearer ${context.spotify_access_token}`
            }
          }
        );

        if (searchResponse.ok) {
          const searchData = await searchResponse.json();
          const playlists = searchData.playlists?.items?.filter(p => p !== null) || [];
          
          for (const p of playlists) {
            if (!seenIds.has(p.id)) {
              seenIds.add(p.id);
              allPlaylists.push({
                id: p.id,
                name: p.name,
                description: p.description,
                image: p.images?.[0]?.url,
                uri: p.uri,
                external_url: p.external_urls?.spotify,
                tracks_total: p.tracks?.total
              });
            }
          }
        }
      } catch (searchErr) {
        console.error('Error buscando:', term, searchErr);
      }
    }

    res.json({
      playlists: allPlaylists.slice(0, 8),
      aiMessage,
      searchTerms
    });

  } catch (err) {
    console.error('Error en music-chat:', err);
    res.status(500).json({ message: 'Error procesando tu petición' });
  }
});
module.exports = router;
