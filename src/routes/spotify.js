// src/routes/spotify.js
const router = require('express').Router();
const auth = require('../middlewares/auth');
const { UserContext } = require('../models');

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;
/**
 * GET /api/spotify/auth-url
 * Genera URL de autorización de Spotify
 */
router.get('/auth-url', auth, (req, res) => {
  const scopes = [
    'user-read-private',
    'user-read-email',
    'playlist-read-private',
    'user-top-read',
    'user-library-read'
  ].join(' ');

  const authUrl = `https://accounts.spotify.com/authorize?` +
    `client_id=${SPOTIFY_CLIENT_ID}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(SPOTIFY_REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&state=${req.user.id}`;

  res.json({ url: authUrl });
});

/**
 * POST /api/spotify/callback
 * Intercambia código por tokens
 */
router.post('/callback', auth, async (req, res) => {
  try {
    const { code } = req.body;

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

    res.json({ success: true });
  } catch (err) {
    console.error('Error en Spotify callback:', err);
    res.status(500).json({ message: 'Error conectando con Spotify' });
  }
});

/**
 * GET /api/spotify/playlists
 * Obtiene playlists recomendadas según el mood
 */
router.get('/playlists', auth, async (req, res) => {
  try {
    const { mood } = req.query; // energetic, focused, intense, calm
    const context = await UserContext.findOne({ where: { user_id: req.user.id } });

    if (!context?.spotify_access_token) {
      return res.status(401).json({ message: 'Spotify no conectado', needsAuth: true });
    }

    // Verificar si token expiró
    if (new Date() > new Date(context.spotify_token_expires)) {
      // Refrescar token
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
      await context.update({
        spotify_access_token: refreshData.access_token,
        spotify_token_expires: new Date(Date.now() + refreshData.expires_in * 1000)
      });
    }

    // Mapear mood a género/búsqueda
    const moodMap = {
      energetic: 'workout pop',
      focused: 'electronic focus',
      intense: 'workout hardcore',
      calm: 'chill stretching'
    };

    const searchQuery = moodMap[mood] || 'workout';

    // Buscar playlists
    const searchResponse = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery)}&type=playlist&limit=5`,
      {
        headers: {
          'Authorization': `Bearer ${context.spotify_access_token}`
        }
      }
    );

    const searchData = await searchResponse.json();

    const playlists = searchData.playlists?.items?.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      image: p.images?.[0]?.url,
      uri: p.uri,
      external_url: p.external_urls?.spotify,
      tracks_total: p.tracks?.total
    })) || [];

    res.json({ playlists });
  } catch (err) {
    console.error('Error obteniendo playlists:', err);
    res.status(500).json({ message: 'Error obteniendo playlists' });
  }
});

/**
 * GET /api/spotify/status
 * Verifica si Spotify está conectado
 */
router.get('/status', auth, async (req, res) => {
  try {
    const context = await UserContext.findOne({ where: { user_id: req.user.id } });
    res.json({ 
      connected: !!context?.spotify_access_token,
      expires: context?.spotify_token_expires 
    });
  } catch (err) {
    res.json({ connected: false });
  }
});

module.exports = router;