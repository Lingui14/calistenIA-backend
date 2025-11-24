// src/models/Exercise.js
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
  
  exercise_type: {
    type: DataTypes.STRING,
    defaultValue: 'standard',
  },
  
  // NUEVO: Ejercicios del circuito para HIIT/AMRAP/EMOM
  circuit_exercises: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: null,
  },
  
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
    defaultValue: 60,
  },
  
  amrap_duration: {
    type: DataTypes.INTEGER,
    defaultValue: null,
  },
  
  hiit_work_time: {
    type: DataTypes.INTEGER,
    defaultValue: null,
  },
  hiit_rest_time: {
    type: DataTypes.INTEGER,
    defaultValue: null,
  },
  hiit_rounds: {
    type: DataTypes.INTEGER,
    defaultValue: null,
  },
  
  emom_duration: {
    type: DataTypes.INTEGER,
    defaultValue: null,
  },
  
  target_metric: {
    type: DataTypes.STRING,
    defaultValue: 'reps',
  },
  
  order_index: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  
  notes: DataTypes.TEXT,
  
}, {
  tableName: 'Exercises',
  timestamps: true,
});

module.exports = Exercise;