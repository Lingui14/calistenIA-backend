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

const app = express();
app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(morgan('dev'));

app.get('/ping', (req, res) => res.json({ ok: true }));

app.use('/auth', authRoutes);
app.use('/profile', profileRoutes);
app.use('/routines', routineRoutes);
app.use('/sessions', trainingRoutes);

const PORT = process.env.PORT || 4000;

async function start() {
  try {
    await sequelize.authenticate();
    console.log('✅ Conectado a la BD');

    await sequelize.sync(); // MVP: crea tablas si no existen
    console.log('✅ Tablas sincronizadas');

    app.listen(PORT, () => {
      console.log(`🚀 Backend escuchando en http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌ Error al iniciar backend:', err);
  }
}

start();
