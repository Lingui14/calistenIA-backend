// src/index.js (ACTUALIZADO)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { sequelize } = require('./config/db');
require('./models');

const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const routineRoutes = require('./routes/routines');
const routinesAiRoutes = require('./routes/routines-ai');
const trainingRoutes = require('./routes/training');
const foodRoutes = require('./routes/food');
const activityRoutes = require('./routes/activity');
const chatRoutes = require('./routes/chat');
const spotifyRoutes = require('./routes/spotify');

const app = express();
app.use(cors());
app.use(helmet());
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

// Health check
app.get('/ping', (req, res) => res.json({ ok: true }));

// Rutas API
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/routines', routineRoutes);
app.use('/api/routines', routinesAiRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/food', foodRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/spotify', spotifyRoutes);

// Rutas legacy sin /api
app.use('/auth', authRoutes);
app.use('/profile', profileRoutes);
app.use('/routines', routineRoutes);

const PORT = process.env.PORT || 4000;

async function start() {
  try {
    await sequelize.authenticate();
    console.log('✅ Conectado a la BD');

    await sequelize.sync({ alter: true });
    console.log('✅ Tablas sincronizadas');

    app.listen(PORT, () => {
      console.log(`🚀 Backend escuchando en http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌ Error al iniciar backend:', err);
  }
}

start();