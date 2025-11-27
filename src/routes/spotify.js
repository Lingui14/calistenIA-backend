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
  'playlist-modify-public',
  'playlist-modify-private',
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
/**
 * POST /api/spotify/music-chat
 * Genera recomendaciones personalizadas con IA
 */
router.post('/music-chat', auth, async (req, res) => {
  try {
    const { message } = req.body;
    const context = await UserContext.findOne({ where: { user_id: req.user.id } });

    if (!message) {
      return res.status(400).json({ message: 'Mensaje requerido' });
    }

    if (!context?.spotify_access_token) {
      return res.json({ 
        tracks: [],
        aiMessage: 'Conecta tu Spotify primero para obtener recomendaciones personalizadas.',
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
            tracks: [],
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
          tracks: [],
          aiMessage: 'Error refrescando sesión de Spotify.',
          needsConnection: true
        });
      }
    }

    const accessToken = context.spotify_access_token;

    // 1. Obtener top artists del usuario para seeds
    let seedArtists = [];
    let seedTracks = [];
    
    try {
      const topArtistsRes = await fetch(
        'https://api.spotify.com/v1/me/top/artists?limit=5&time_range=medium_term',
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      
      if (topArtistsRes.ok) {
        const topArtists = await topArtistsRes.json();
        seedArtists = topArtists.items?.slice(0, 2).map(a => a.id) || [];
      }

      const topTracksRes = await fetch(
        'https://api.spotify.com/v1/me/top/tracks?limit=5&time_range=medium_term',
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      
      if (topTracksRes.ok) {
        const topTracks = await topTracksRes.json();
        seedTracks = topTracks.items?.slice(0, 2).map(t => t.id) || [];
      }
    } catch (err) {
      console.log('Error obteniendo top items:', err);
    }

    // 2. Usar IA para interpretar el mensaje
    const aiPrompt = `El usuario quiere música para entrenar y dice: "${message}"

Interpreta lo que quiere y genera parámetros para Spotify.

GÉNEROS VÁLIDOS DE SPOTIFY (usa solo estos):
acoustic, afrobeat, alt-rock, alternative, ambient, anime, black-metal, bluegrass, blues, bossanova, brazil, breakbeat, british, cantopop, chicago-house, children, chill, classical, club, comedy, country, dance, dancehall, death-metal, deep-house, detroit-techno, disco, disney, drum-and-bass, dub, dubstep, edm, electro, electronic, emo, folk, forro, french, funk, garage, german, gospel, goth, grindcore, groove, grunge, guitar, happy, hard-rock, hardcore, hardstyle, heavy-metal, hip-hop, holidays, honky-tonk, house, idm, indian, indie, indie-pop, industrial, iranian, j-dance, j-idol, j-pop, j-rock, jazz, k-pop, kids, latin, latino, malay, mandopop, metal, metal-misc, metalcore, minimal-techno, movies, mpb, new-age, new-release, opera, pagode, party, philippines-opm, piano, pop, pop-film, post-dubstep, power-pop, progressive-house, psych-rock, punk, punk-rock, r-n-b, rainy-day, reggae, reggaeton, road-trip, rock, rock-n-roll, rockabilly, romance, sad, salsa, samba, sertanejo, show-tunes, singer-songwriter, ska, sleep, songwriter, soul, soundtracks, spanish, study, summer, swedish, synth-pop, tango, techno, trance, trip-hop, turkish, work-out, world-music

RESPONDE SOLO CON JSON:
{
  "genres": ["género1", "género2"],
  "energy": 0.8,
  "tempo": 130,
  "valence": 0.7,
  "response": "Mensaje corto describiendo lo que vas a generar (máx 25 palabras)",
  "playlistName": "Nombre creativo para la playlist (máx 5 palabras)"
}

Donde:
- genres: 1-2 géneros de la lista de arriba que mejor coincidan
- energy: 0.0 (calmado) a 1.0 (muy energético)
- tempo: BPM aproximado (60-180)
- valence: 0.0 (triste/oscuro) a 1.0 (alegre/positivo)

Ejemplos:
- "rock psicodélico" -> {"genres": ["psych-rock", "alt-rock"], "energy": 0.7, "tempo": 120, "valence": 0.6}
- "reggaeton para cardio" -> {"genres": ["reggaeton", "latin"], "energy": 0.9, "tempo": 100, "valence": 0.8}
- "metal pesado intenso" -> {"genres": ["metal", "heavy-metal"], "energy": 0.95, "tempo": 140, "valence": 0.4}`;

    let genres = ['work-out'];
    let energy = 0.7;
    let tempo = 120;
    let valence = 0.6;
    let aiMessage = `Generando música para "${message}"...`;
    let playlistName = 'Mi Mix para Entrenar';

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
          max_tokens: 400,
          temperature: 0.7,
        }),
      });

      if (aiResponse.ok) {
        const aiData = await aiResponse.json();
        const content = aiData.choices?.[0]?.message?.content || '';
        
        let parsed;
        try {
          parsed = JSON.parse(content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim());
        } catch (e) {
          const match = content.match(/\{[\s\S]*\}/);
          if (match) parsed = JSON.parse(match[0]);
        }

        if (parsed) {
          if (parsed.genres?.length > 0) genres = parsed.genres.slice(0, 2);
          if (parsed.energy !== undefined) energy = parsed.energy;
          if (parsed.tempo !== undefined) tempo = parsed.tempo;
          if (parsed.valence !== undefined) valence = parsed.valence;
          if (parsed.response) aiMessage = parsed.response;
          if (parsed.playlistName) playlistName = parsed.playlistName;
        }
      }
    } catch (aiErr) {
      console.error('Error con IA:', aiErr);
    }

    // 3. Llamar a Spotify Recommendations
    const seedGenres = genres.slice(0, 2);
    const totalSeeds = seedArtists.length + seedTracks.length + seedGenres.length;
    
    // Spotify permite máximo 5 seeds en total
    let finalSeedArtists = seedArtists;
    let finalSeedTracks = seedTracks;
    let finalSeedGenres = seedGenres;
    
    if (totalSeeds > 5) {
      finalSeedArtists = seedArtists.slice(0, 1);
      finalSeedTracks = seedTracks.slice(0, 1);
      finalSeedGenres = seedGenres.slice(0, 2);
    }

    const recoParams = new URLSearchParams({
      limit: '20',
      target_energy: energy.toString(),
      min_energy: Math.max(0, energy - 0.2).toString(),
      target_tempo: tempo.toString(),
      target_valence: valence.toString(),
    });

    if (finalSeedArtists.length > 0) {
      recoParams.append('seed_artists', finalSeedArtists.join(','));
    }
    if (finalSeedTracks.length > 0) {
      recoParams.append('seed_tracks', finalSeedTracks.join(','));
    }
    if (finalSeedGenres.length > 0) {
      recoParams.append('seed_genres', finalSeedGenres.join(','));
    }

    // Si no hay seeds de usuario, usar solo géneros
    if (finalSeedArtists.length === 0 && finalSeedTracks.length === 0) {
      recoParams.set('seed_genres', genres.slice(0, 5).join(','));
    }

    console.log('Spotify recommendations params:', recoParams.toString());

    const recoResponse = await fetch(
      `https://api.spotify.com/v1/recommendations?${recoParams.toString()}`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );

    if (!recoResponse.ok) {
      const errorText = await recoResponse.text();
      console.error('Spotify recommendations error:', errorText);
      return res.json({
        tracks: [],
        aiMessage: 'No pude generar recomendaciones. Intenta con otra descripción.',
        playlistName
      });
    }

    const recoData = await recoResponse.json();
    
    const tracks = recoData.tracks?.map(t => ({
      id: t.id,
      name: t.name,
      artist: t.artists?.map(a => a.name).join(', ') || 'Artista desconocido',
      album: t.album?.name || '',
      image: t.album?.images?.[0]?.url || null,
      duration_ms: t.duration_ms,
      uri: t.uri,
      external_url: t.external_urls?.spotify,
      preview_url: t.preview_url,
    })) || [];

    res.json({
      tracks,
      aiMessage,
      playlistName,
      trackUris: tracks.map(t => t.uri),
    });

  } catch (err) {
    console.error('Error en music-chat:', err);
    res.status(500).json({ message: 'Error generando recomendaciones' });
  }
});

/**
 * POST /api/spotify/save-playlist
 * Guarda los tracks como playlist en la cuenta del usuario
 */
router.post('/save-playlist', auth, async (req, res) => {
  try {
    const { name, trackUris } = req.body;
    const context = await UserContext.findOne({ where: { user_id: req.user.id } });

    if (!context?.spotify_access_token) {
      return res.status(401).json({ message: 'Spotify no conectado' });
    }

    if (!trackUris || trackUris.length === 0) {
      return res.status(400).json({ message: 'No hay tracks para guardar' });
    }

    const accessToken = context.spotify_access_token;

    // 1. Obtener el ID del usuario de Spotify
    const meResponse = await fetch('https://api.spotify.com/v1/me', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!meResponse.ok) {
      return res.status(500).json({ message: 'Error obteniendo perfil de Spotify' });
    }

    const meData = await meResponse.json();
    const spotifyUserId = meData.id;

    // 2. Crear la playlist
    const createResponse = await fetch(
      `https://api.spotify.com/v1/users/${spotifyUserId}/playlists`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name || 'Mi Mix de CalistenIA',
          description: 'Playlist generada por CalistenIA 💪',
          public: false,
        }),
      }
    );

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error('Error creando playlist:', errorText);
      return res.status(500).json({ message: 'Error creando playlist' });
    }

    const playlistData = await createResponse.json();

    // 3. Agregar los tracks
    const addTracksResponse = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistData.id}/tracks`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uris: trackUris.slice(0, 100), // Spotify permite max 100 por request
        }),
      }
    );

    if (!addTracksResponse.ok) {
      const errorText = await addTracksResponse.text();
      console.error('Error agregando tracks:', errorText);
      return res.status(500).json({ message: 'Playlist creada pero error agregando tracks' });
    }

    res.json({
      success: true,
      playlist: {
        id: playlistData.id,
        name: playlistData.name,
        external_url: playlistData.external_urls?.spotify,
        tracks_count: trackUris.length,
      },
      message: `¡Playlist "${playlistData.name}" guardada con ${trackUris.length} tracks!`
    });

  } catch (err) {
    console.error('Error guardando playlist:', err);
    res.status(500).json({ message: 'Error guardando playlist' });
  }
});
module.exports = router;
