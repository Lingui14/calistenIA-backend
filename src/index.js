require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { sequelize } = require('./config/db');
require('./models'); // importa index.js de models para cargar asociaciones

const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const routineRoutes = require('./routes/routines');
const trainingRoutes = require('./routes/training');
const foodRoutes = require('./routes/food');
const activityRoutes = require('./routes/activity');
const chatRoutes = require('./routes/chat');

const app = express();
app.use(cors());
app.use(helmet());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(morgan('dev'));
app.use('/api/chat', chatRoutes);

// Health check
app.get('/ping', (req, res) => res.json({ ok: true }));

// Rutas con prefijo /api para coincidir con el frontend
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/routines', routineRoutes);
app.use('/api/training', trainingRoutes);

// También mantener rutas sin /api por compatibilidad
app.use('/auth', authRoutes);
app.use('/profile', profileRoutes);
app.use('/routines', routineRoutes);
app.use('/api/food', foodRoutes);
app.use('/api/activity', activityRoutes);

const PORT = process.env.PORT || 4000;

async function start() {
  try {
    await sequelize.authenticate();
    console.log('✅ Conectado a la BD');

    await sequelize.sync({ alter: true }); // alter: true actualiza tablas existentes
    console.log('✅ Tablas sincronizadas');

    app.listen(PORT, () => {
      console.log(`🚀 Backend escuchando en http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌ Error al iniciar backend:', err);
  }
}

start();
