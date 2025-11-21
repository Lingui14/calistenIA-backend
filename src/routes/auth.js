const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');

const { User, UserProfile } = require('../models');

// Esquemas de validación
const registerSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Email inválido',
    'any.required': 'Email es requerido',
  }),
  password: Joi.string().min(6).required().messages({
    'string.min': 'La contraseña debe tener al menos 6 caracteres',
    'any.required': 'Contraseña es requerida',
  }),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

/**
 * POST /api/auth/register
 * Registra un nuevo usuario
 */
router.post('/register', async (req, res) => {
  try {
    const { error } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const { email, password } = req.body;
    
    // Verificar si el email ya existe
    const exists = await User.findOne({ where: { email } });
    if (exists) {
      return res.status(400).json({ message: 'Email ya registrado' });
    }

    // Hash de la contraseña
    const hash = await bcrypt.hash(password, 10);
    
    // Crear usuario
    const user = await User.create({ email, password_hash: hash });
    
    // Crear perfil vacío
    await UserProfile.create({ user_id: user.id });

    // Generar token
    const token = jwt.sign(
      { id: user.id }, 
      process.env.JWT_SECRET, 
      { expiresIn: process.env.JWT_EXPIRES || '7d' }
    );

    res.json({ token });
  } catch (err) {
    console.error('Error en POST /auth/register:', err);
    res.status(500).json({ message: 'Error al registrar usuario' });
  }
});

/**
 * POST /api/auth/login
 * Inicia sesión
 */
router.post('/login', async (req, res) => {
  try {
    const { error } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const { email, password } = req.body;
    
    // Buscar usuario
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(400).json({ message: 'Credenciales inválidas' });
    }

    // Verificar contraseña
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(400).json({ message: 'Credenciales inválidas' });
    }

    // Generar token
    const token = jwt.sign(
      { id: user.id }, 
      process.env.JWT_SECRET, 
      { expiresIn: process.env.JWT_EXPIRES || '7d' }
    );

    res.json({ token });
  } catch (err) {
    console.error('Error en POST /auth/login:', err);
    res.status(500).json({ message: 'Error al iniciar sesión' });
  }
});

/**
 * GET /api/auth/me
 * Obtiene el usuario actual (requiere token)
 */
const auth = require('../middlewares/auth');
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'email', 'createdAt'],
      include: [{ model: UserProfile }],
    });

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    res.json(user);
  } catch (err) {
    console.error('Error en GET /auth/me:', err);
    res.status(500).json({ message: 'Error obteniendo usuario' });
  }
});

module.exports = router;
