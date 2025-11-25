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
    defaultValue: 'calisthenics',
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
  preferred_duration: {
    type: DataTypes.INTEGER,
    defaultValue: 45,
  },
  preferred_intensity: {
    type: DataTypes.STRING,
    defaultValue: 'moderate',
  },
  include_warmup: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  include_cooldown: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  preferred_workout_types: {
    type: DataTypes.JSON,
    defaultValue: ['strength'],
  },
  // Spotify
  spotify_access_token: DataTypes.TEXT,
  spotify_refresh_token: DataTypes.TEXT,
  spotify_token_expires: DataTypes.DATE,
  // Historial resumido
  training_summary: {
    type: DataTypes.TEXT,
    defaultValue: '',
  },
  chat_context: {
    type: DataTypes.TEXT,
    defaultValue: '',
  },
  
  // ========== NUEVOS CAMPOS - RACHAS ==========
  current_streak: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  longest_streak: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  last_workout_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  total_workouts: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  total_minutes: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  // ========== FIN NUEVOS CAMPOS ==========
  
}, {
  tableName: 'UserContexts',
  timestamps: true,
});

module.exports = UserContext;