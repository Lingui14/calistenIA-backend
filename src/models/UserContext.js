// src/models/UserContext.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const UserContext = sequelize.define('UserContext', {
  id: { 
    type: DataTypes.UUID, 
    defaultValue: DataTypes.UUIDV4, 
    primaryKey: true 
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    unique: true,
  },
  // Contexto de entrenamiento
  training_focus: {
    type: DataTypes.STRING,
    defaultValue: 'calisthenics', // calisthenics, strength, mobility, skills
  },
  preferred_exercises: {
    type: DataTypes.JSON,
    defaultValue: [],
  },
  avoided_exercises: {
    type: DataTypes.JSON,
    defaultValue: [],
  },
  injuries: {
    type: DataTypes.JSON,
    defaultValue: [],
  },
  // Preferencias de rutina
  preferred_duration: {
    type: DataTypes.INTEGER,
    defaultValue: 45, // minutos
  },
  preferred_intensity: {
    type: DataTypes.STRING,
    defaultValue: 'moderate', // low, moderate, high, extreme
  },
  include_warmup: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  include_cooldown: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  // Tipos de entrenamiento preferidos
  preferred_workout_types: {
    type: DataTypes.JSON,
    defaultValue: ['strength'], // strength, amrap, hiit, emom, circuit
  },
  // Spotify
  spotify_access_token: DataTypes.TEXT,
  spotify_refresh_token: DataTypes.TEXT,
  spotify_token_expires: DataTypes.DATE,
  // Historial resumido (para contexto de IA)
  training_summary: {
    type: DataTypes.TEXT, // Resumen en texto de su historial
    defaultValue: '',
  },
  // Último mensaje/contexto del chat
  chat_context: {
    type: DataTypes.TEXT,
    defaultValue: '',
  },
}, {
  tableName: 'UserContexts',
  timestamps: true,
});

module.exports = UserContext;