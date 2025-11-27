// src/routes/spotify.js
const router = require('express').Router();
const auth = require('../middlewares/auth');
const { UserContext } = require('../models');

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_REDIRECT_URI = 'https://calistenia-backend-production-6e8f.up.railway.app/api/spotify/callback-web';

/**
 * GET /api/spotify/auth-url
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

    const state = req.user.id;

    const authUrl = `https://accounts.spotify.com/authorize?` +
      `client_id=${SPOTIFY_CLIENT_ID}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(SPOTIFY_REDIRECT_URI)}` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&state=${state}`;

    console.log('Spotify auth URL generada');
    res.json({ url: authUrl });
  } catch (err) {
    console.error('Error generando auth URL:', err);
    res.status(500).json({ message: 'Error generando URL de autorización' });
  }
});

/**
 * GET /api/spotify/callback-web
 */
router.get('/callback-web', async (req, res) => {
  const { code, error, state } = req.query;
  
  console.log('Callback web recibido:', { code: code ? 'SI' : 'NO', error, state });
  
  if (error) {
    return res.send(`
      <html>
        <head><meta name="viewport" content="width=device-width, initial-scale=1">
          <style>body { font-family: -apple-system, sans-serif; background: #000; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; } h1 { color: #ff4444; }</style>
        </head>
        <body><div><h1>Error</h1><p>${error}</p><p>Puedes cerrar esta ventana.</p></div></body>
      </html>
    `);
  }
  
  if (code) {
    const appUrl = `calistenia://spotify-callback?code=${code}&state=${state || ''}`;
    return res.send(`
      <html>
        <head><meta name="viewport" content="width=device-width, initial-scale=1">
          <meta http-equiv="refresh" content="1;url=${appUrl}">
          <style>body { font-family: -apple-system, sans-serif; background: #000; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; } .spinner { width: 40px; height: 40px; border: 3px solid #333; border-top-color: #fff; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 20px; } @keyframes spin { to { transform: rotate(360deg); } } a { color: #1DB954; }</style>
        </head>
        <body><div><div class="spinner"></div><h2>Conectando...</h2><p>Redirigiendo a CalistenIA</p><p style="margin-top: 20px; font-size: 14px; color: #888;">Si no se abre, <a href="${appUrl}">toca aquí</a></p></div></body>
      </html>
    `);
  }
  
  res.send(`<html><body style="background:#000;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;"><div><h1>Error</h1><p>No se recibió código</p></div></body></html>`);
});

/**
 * POST /api/spotify/callback
 */
router.post('/callback', auth, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: 'Código no proporcionado' });

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
 * GET /api/spotify/status
 */
router.get('/status', auth, async (req, res) => {
  try {
    const context = await UserContext.findOne({ where: { user_id: req.user.id } });
    const isConnected = !!(context?.spotify_access_token && 
      context?.spotify_token_expires && 
      new Date() < new Date(context.spotify_token_expires));
    res.json({ connected: isConnected, expires: context?.spotify_token_expires });
  } catch (err) {
    res.json({ connected: false });
  }
});

/**
 * GET /api/spotify/playlists
 */
router.get('/playlists', auth, async (req, res) => {
  try {
    const { mood } = req.query;
    const context = await UserContext.findOne({ where: { user_id: req.user.id } });

    if (!context?.spotify_access_token) {
      return res.json({ playlists: getFallbackPlaylists(mood) });
    }

    // Verificar si token expiró
    if (new Date() > new Date(context.spotify_token_expires)) {
      const refreshed = await refreshToken(context);
      if (!refreshed) return res.json({ playlists: getFallbackPlaylists(mood) });
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
      { headers: { 'Authorization': `Bearer ${context.spotify_access_token}` } }
    );

    if (!searchResponse.ok) {
      return res.json({ playlists: getFallbackPlaylists(mood) });
    }

    const searchData = await searchResponse.json();

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

/**
 * POST /api/spotify/music-chat
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
        aiMessage: 'Conecta tu Spotify primero.',
        needsConnection: true
      });
    }

    // Verificar/refrescar token
    if (new Date() > new Date(context.spotify_token_expires)) {
      const refreshed = await refreshToken(context);
      if (!refreshed) {
        return res.json({ 
          tracks: [],
          aiMessage: 'Tu sesión de Spotify expiró. Reconecta tu cuenta.',
          needsConnection: true
        });
      }
    }

    const accessToken = context.spotify_access_token;

    // Obtener top artists del usuario para personalizar
    let userTopArtists = [];
    try {
      const topArtistsRes = await fetch(
        'https://api.spotify.com/v1/me/top/artists?limit=10&time_range=medium_term',
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      
      if (topArtistsRes.ok) {
        const topData = await topArtistsRes.json();
        userTopArtists = topData.items?.map(a => ({
          name: a.name,
          genres: a.genres || []
        })) || [];
        console.log('Top artists del usuario:', userTopArtists.map(a => a.name));
      }
    } catch (err) {
      console.log('No se pudieron obtener top artists:', err.message);
    }

    // Usar IA para interpretar el mensaje
    let artists = [];
    let genres = [];
    let aiMessage = `Buscando música para "${message}"...`;
    let playlistName = 'Mi Mix para Entrenar';

    try {
      const userContext = userTopArtists.length > 0 
        ? `\n\nCONTEXTO: Los artistas favoritos del usuario son: ${userTopArtists.slice(0, 5).map(a => a.name).join(', ')}`
        : '';

      const aiPrompt = `El usuario quiere música para entrenar y dice: "${message}"${userContext}

Analiza el mensaje y extrae TODOS los artistas y géneros mencionados.

GÉNEROS VÁLIDOS: acoustic, alt-rock, ambient, blues, chill, classical, club, dance, deep-house, disco, drum-and-bass, dubstep, edm, electro, electronic, folk, funk, hard-rock, hardcore, hardstyle, heavy-metal, hip-hop, house, indie, indie-pop, jazz, k-pop, latin, latino, metal, metalcore, party, piano, pop, progressive-house, psych-rock, punk, punk-rock, r-n-b, reggae, reggaeton, rock, salsa, soul, synth-pop, techno, trance, work-out

RESPONDE SOLO JSON:
{
  "artists": ["artista1", "artista2", ...],
  "genres": ["género1", "género2", ...],
  "response": "Mensaje corto describiendo lo que vas a buscar",
  "playlistName": "Nombre creativo para la playlist"
}

REGLAS:
- Extrae TODOS los artistas mencionados
- Extrae TODOS los géneros mencionados
- Para "rock psicodélico" usa artistas como: Pink Floyd, Tame Impala, King Crimson, Yes, The Doors
- Para "rock progresivo" usa artistas como: Pink Floyd, Genesis, Yes, Rush, King Crimson, Dream Theater
- Para "jazz" usa artistas como: Miles Davis, John Coltrane, Herbie Hancock, Thelonious Monk
- Para "pop" usa artistas como: Taylor Swift, Dua Lipa, The Weeknd, Bruno Mars
- Para "reggaeton" usa artistas como: Bad Bunny, Daddy Yankee, J Balvin, Ozuna
- Para "hip-hop" usa artistas como: Kendrick Lamar, Drake, J. Cole, Travis Scott
- Para "metal" usa artistas como: Metallica, Slipknot, Pantera, Iron Maiden, Avenged Sevenfold, Deftones
- Para CUALQUIER género que pida el usuario, incluye artistas representativos de ese género
- Si el usuario pide un género específico, INCLUYE artistas representativos de ese género
- Si menciona artistas Y géneros, incluye ambos

EJEMPLOS:
- "rock psicodélico" -> {"artists": ["Pink Floyd", "Tame Impala", "The Doors", "King Crimson"], "genres": ["psych-rock"], ...}
- "rock progresivo energético" -> {"artists": ["Yes", "Rush", "Dream Theater", "Tool"], "genres": ["progressive-house"], ...}
- "Pink Floyd y Daft Punk" -> {"artists": ["Pink Floyd", "Daft Punk"], "genres": ["psych-rock", "electronic"], ...}`;

      const aiResponse = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.REACT_APP_XAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'grok-3-fast',
          messages: [
            { role: 'system', content: 'Experto en música. Responde SOLO JSON válido. Cuando el usuario pide géneros específicos, SIEMPRE incluye artistas representativos.' },
            { role: 'user', content: aiPrompt }
          ],
          max_tokens: 500,
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
          if (parsed.artists?.length > 0) artists = parsed.artists;
          if (parsed.genres?.length > 0) genres = parsed.genres;
          if (parsed.response) aiMessage = parsed.response;
          if (parsed.playlistName) playlistName = parsed.playlistName;
        }
      }
    } catch (aiErr) {
      console.error('Error con IA:', aiErr);
    }

    // Si no hay artistas ni géneros, usar defaults basados en los gustos del usuario
    if (artists.length === 0 && genres.length === 0) {
      if (userTopArtists.length > 0) {
        // Usar los top artists del usuario
        artists = userTopArtists.slice(0, 3).map(a => a.name);
        aiMessage = 'Playlist basada en tus artistas favoritos';
        playlistName = 'Tu Mix Personalizado';
      } else {
        genres = ['work-out'];
      }
    }

    let tracks = [];
    const totalTracks = 30;

    // Calcular cuántos tracks por cada fuente
    const totalSources = Math.max(1, artists.length + genres.length);
    const tracksPerSource = Math.ceil(totalTracks / totalSources);

    console.log(`Buscando: ${artists.length} artistas, ${genres.length} géneros (${tracksPerSource} tracks c/u)`);

    // Buscar por artistas
    for (const artist of artists) {
      try {
        const searchResponse = await fetch(
          `https://api.spotify.com/v1/search?q=artist:${encodeURIComponent(artist)}&type=track&limit=${tracksPerSource}`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );

        if (searchResponse.ok) {
          const searchData = await searchResponse.json();
          const artistTracks = searchData.tracks?.items?.map(t => ({
            id: t.id,
            name: t.name,
            artist: t.artists?.map(a => a.name).join(', ') || 'Artista desconocido',
            album: t.album?.name || '',
            image: t.album?.images?.[0]?.url || null,
            duration_ms: t.duration_ms,
            uri: t.uri,
            external_url: t.external_urls?.spotify,
          })) || [];
          
          tracks = tracks.concat(artistTracks);
          console.log(`  - ${artist}: ${artistTracks.length} tracks`);
        }
      } catch (err) {
        console.error(`Error buscando artista ${artist}:`, err);
      }
    }

    // Buscar por géneros (solo si no hay suficientes tracks de artistas)
    if (genres.length > 0 && tracks.length < totalTracks) {
      const remainingTracks = totalTracks - tracks.length;
      const tracksPerGenre = Math.ceil(remainingTracks / genres.length);
      
      for (const genre of genres) {
        try {
          // Buscar por género puro, sin "workout"
          const searchResponse = await fetch(
            `https://api.spotify.com/v1/search?q=genre:${encodeURIComponent(genre)}&type=track&limit=${tracksPerGenre}`,
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
          );

          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            const genreTracks = searchData.tracks?.items?.map(t => ({
              id: t.id,
              name: t.name,
              artist: t.artists?.map(a => a.name).join(', ') || 'Artista desconocido',
              album: t.album?.name || '',
              image: t.album?.images?.[0]?.url || null,
              duration_ms: t.duration_ms,
              uri: t.uri,
              external_url: t.external_urls?.spotify,
            })) || [];
            
            tracks = tracks.concat(genreTracks);
            console.log(`  - género ${genre}: ${genreTracks.length} tracks`);
          }
        } catch (err) {
          console.error(`Error buscando género ${genre}:`, err);
        }
      }
    }

    // Eliminar duplicados (por ID)
    const uniqueTracks = [];
    const seenIds = new Set();
    for (const track of tracks) {
      if (!seenIds.has(track.id)) {
        seenIds.add(track.id);
        uniqueTracks.push(track);
      }
    }
    tracks = uniqueTracks;

    // Mezclar los tracks
    tracks = shuffleArray(tracks);

    // Limitar a 30 tracks
    tracks = tracks.slice(0, 30);

    console.log(`Total: ${tracks.length} tracks únicos`);

    if (tracks.length === 0) {
      return res.json({
        tracks: [],
        aiMessage: 'No encontré canciones para eso. Intenta con otra descripción.',
        playlistName
      });
    }

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

    // Obtener ID del usuario
    const meResponse = await fetch('https://api.spotify.com/v1/me', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!meResponse.ok) {
      return res.status(500).json({ message: 'Error obteniendo perfil de Spotify' });
    }

    const meData = await meResponse.json();

    // Crear playlist
    const createResponse = await fetch(
      `https://api.spotify.com/v1/users/${meData.id}/playlists`,
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
      console.error('Error creando playlist:', await createResponse.text());
      return res.status(500).json({ message: 'Error creando playlist' });
    }

    const playlistData = await createResponse.json();

    // Agregar tracks
    const addTracksResponse = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistData.id}/tracks`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uris: trackUris.slice(0, 100) }),
      }
    );

    if (!addTracksResponse.ok) {
      console.error('Error agregando tracks:', await addTracksResponse.text());
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

// Helpers
async function refreshToken(context) {
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
      return false;
    }

    await context.update({
      spotify_access_token: refreshData.access_token,
      spotify_token_expires: new Date(Date.now() + refreshData.expires_in * 1000)
    });
    return true;
  } catch (err) {
    console.error('Error refrescando token:', err);
    return false;
  }
}

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

// Función para mezclar array (shuffle)
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

module.exports = router;