// src/routes/profile.js
const router = require('express').Router();
const auth = require('../middlewares/auth');
const { UserProfile } = require('../models');

/**
 * GET /api/profile/me
 * Obtiene el perfil del usuario actual
 */
router.get('/me', auth, async (req, res) => {
  try {
    let profile = await UserProfile.findOne({ 
      where: { user_id: req.user.id } 
    });

    // Si no existe perfil, crear uno vacío
    if (!profile) {
      profile = await UserProfile.create({ user_id: req.user.id });
    }

    res.json(profile);
  } catch (err) {
    console.error('Error en GET /profile/me:', err);
    res.status(500).json({ message: 'Error obteniendo perfil' });
  }
});

/**
 * PUT /api/profile/me
 * Actualiza el perfil del usuario
 */
router.put('/me', auth, async (req, res) => {
  try {
    let profile = await UserProfile.findOne({ 
      where: { user_id: req.user.id } 
    });

    if (!profile) {
      profile = await UserProfile.create({ 
        user_id: req.user.id,
        ...req.body 
      });
    } else {
      // Solo actualizar campos permitidos
      const allowedFields = [
        'name', 
        'age', 
        'weight', 
        'height', 
        'experience_level', 
        'available_equipment', 
        'goals'
      ];
      
      const updates = {};
      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      });

      await profile.update(updates);
    }

    res.json(profile);
  } catch (err) {
    console.error('Error en PUT /profile/me:', err);
    res.status(500).json({ message: 'Error actualizando perfil' });
  }
});

/**
 * PATCH /api/profile/equipment
 * Actualiza solo el equipo disponible
 */
router.patch('/equipment', auth, async (req, res) => {
  try {
    const { equipment } = req.body;

    if (!Array.isArray(equipment)) {
      return res.status(400).json({ message: 'equipment debe ser un array' });
    }

    let profile = await UserProfile.findOne({ 
      where: { user_id: req.user.id } 
    });

    if (!profile) {
      profile = await UserProfile.create({ 
        user_id: req.user.id,
        available_equipment: equipment 
      });
    } else {
      await profile.update({ available_equipment: equipment });
    }

    res.json(profile);
  } catch (err) {
    console.error('Error en PATCH /profile/equipment:', err);
    res.status(500).json({ message: 'Error actualizando equipo' });
  }
});

module.exports = router;
