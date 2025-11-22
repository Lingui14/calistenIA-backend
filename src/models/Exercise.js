// src/models/Exercise.js (ACTUALIZADO)
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Exercise = sequelize.define('Exercise', {
  id: { 
    type: DataTypes.UUID, 
    defaultValue: DataTypes.UUIDV4, 
    primaryKey: true 
  },
  routine_id: { 
    type: DataTypes.UUID, 
    allowNull: false 
  },
  name: { 
    type: DataTypes.STRING, 
    allowNull: false 
  },
  description: DataTypes.TEXT,
  
  // Tipo de ejercicio
  exercise_type: {
    type: DataTypes.STRING,
    defaultValue: 'standard', // standard, amrap, hiit, emom, rest
  },
  
  // Para ejercicios estándar
  sets: {
    type: DataTypes.INTEGER,
    defaultValue: 3,
  },
  reps: {
    type: DataTypes.INTEGER,
    defaultValue: 10,
  },
  rest_time: {
    type: DataTypes.INTEGER,
    defaultValue: 60, // segundos
  },
  
  // Para AMRAP
  amrap_duration: {
    type: DataTypes.INTEGER,
    defaultValue: null, // segundos totales del AMRAP
  },
  
  // Para HIIT/Tabata
  hiit_work_time: {
    type: DataTypes.INTEGER,
    defaultValue: null, // segundos de trabajo
  },
  hiit_rest_time: {
    type: DataTypes.INTEGER,
    defaultValue: null, // segundos de descanso
  },
  hiit_rounds: {
    type: DataTypes.INTEGER,
    defaultValue: null, // número de rondas
  },
  
  // Para EMOM
  emom_duration: {
    type: DataTypes.INTEGER,
    defaultValue: null, // minutos totales
  },
  
  // Registro inteligente
  target_metric: {
    type: DataTypes.STRING,
    defaultValue: 'reps', // reps, time, distance, rounds
  },
  
  order_index: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  
  // Notas/instrucciones
  notes: DataTypes.TEXT,
  
}, {
  tableName: 'Exercises',
  timestamps: true,
});

module.exports = Exercise;