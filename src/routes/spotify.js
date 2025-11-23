// src/routes/spotify.js (BACKEND - ACTUALIZAR SOLO LA RUTA /playlists)

/**
 * GET /api/spotify/playlists
 * Obtiene playlists recomendadas según el mood
 */
router.get('/playlists', auth, async (req, res) => {
  try {
    const { mood } = req.query;
    const context = await UserContext.findOne({ where: { user_id: req.user.id } });

    // FALLBACK: Si no hay Spotify conectado, devolver playlists hardcodeadas
    if (!context?.spotify_access_token) {
      const hardcodedPlaylists = {
        intense: [
          {
            name: 'Beast Mode',
            external_url: 'https://open.spotify.com/playlist/37i9dQZF1DX76Wlfdnj7AP',
            tracks_total: 50,
          },
          {
            name: 'Power Workout',
            external_url: 'https://open.spotify.com/playlist/37i9dQZF1DX32NsLKyzScr',
            tracks_total: 60,
          },
          {
            name: 'Workout Twerkout',
            external_url: 'https://open.spotify.com/playlist/37i9dQZF1DX1ZQxccKVEtV',
            tracks_total: 45,
          },
          {
            name: 'HIIT Training',
            external_url: 'https://open.spotify.com/playlist/37i9dQZF1DX3ZM9RYLzWDQ',
            tracks_total: 55,
          },
        ],
        energetic: [
          {
            name: 'Energy Boost',
            external_url: 'https://open.spotify.com/playlist/37i9dQZF1DXdxcBWuJkbcy',
            tracks_total: 48,
          },
          {
            name: 'Cardio',
            external_url: 'https://open.spotify.com/playlist/37i9dQZF1DWSJHnPb1f0Yj',
            tracks_total: 52,
          },
        ],
        focused: [
          {
            name: 'Deep Focus',
            external_url: 'https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ',
            tracks_total: 55,
          },
          {
            name: 'Instrumental Study',
            external_url: 'https://open.spotify.com/playlist/37i9dQZF1DX3PFzdbtx1Us',
            tracks_total: 48,
          },
        ],
        calm: [
          {
            name: 'Peaceful Piano',
            external_url: 'https://open.spotify.com/playlist/37i9dQZF1DX4sWSpwq3LiO',
            tracks_total: 35,
          },
          {
            name: 'Chill Vibes',
            external_url: 'https://open.spotify.com/playlist/37i9dQZF1DX4WYpdgoIcn6',
            tracks_total: 40,
          },
        ],
      };

      const selectedPlaylists = hardcodedPlaylists[mood] || hardcodedPlaylists.intense;
      return res.json({ playlists: selectedPlaylists });
    }

    // Verificar si token expiró
    if (new Date() > new Date(context.spotify_token_expires)) {
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

    const searchData = await searchResponse.json();

    // FIX: Filtrar items null y mapear correctamente
    const playlists = searchData.playlists?.items
      ?.filter(p => p !== null) // FILTRAR NULLS
      ?.map(p => ({
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
    
    // FALLBACK en caso de error
    const fallbackPlaylists = [
      {
        name: 'Beast Mode',
        external_url: 'https://open.spotify.com/playlist/37i9dQZF1DX76Wlfdnj7AP',
        tracks_total: 50,
      },
      {
        name: 'Power Workout',
        external_url: 'https://open.spotify.com/playlist/37i9dQZF1DX32NsLKyzScr',
        tracks_total: 60,
      },
    ];
    
    res.json({ playlists: fallbackPlaylists });
  }
});