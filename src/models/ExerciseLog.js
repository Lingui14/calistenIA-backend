const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ExerciseLog = sequelize.define('ExerciseLog', {
  id: { 
    type: DataTypes.UUID, 
    defaultValue: DataTypes.UUIDV4, 
    primaryKey: true 
  },
  session_id: { 
    type: DataTypes.UUID, 
    allowNull: false 
  },
  exercise_id: { 
    type: DataTypes.UUID, 
    allowNull: false 
  },
  completed_sets: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  completed_reps: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  notes: DataTypes.TEXT,
}, {
  tableName: 'ExerciseLogs',
  timestamps: true,
});

module.exports = ExerciseLog;
