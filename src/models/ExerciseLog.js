const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const TrainingSession = require('./TrainingSession');
const Exercise = require('./Exercise');

const ExerciseLog = sequelize.define('ExerciseLog', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  session_id: { type: DataTypes.UUID, allowNull: false },
  exercise_id: { type: DataTypes.UUID, allowNull: false },
  completed_sets: DataTypes.INTEGER,
  completed_reps: DataTypes.INTEGER,
  notes: DataTypes.TEXT,
});

TrainingSession.hasMany(ExerciseLog, { foreignKey: 'session_id' });
ExerciseLog.belongsTo(TrainingSession, { foreignKey: 'session_id' });

Exercise.hasMany(ExerciseLog, { foreignKey: 'exercise_id' });
ExerciseLog.belongsTo(Exercise, { foreignKey: 'exercise_id' });

module.exports = ExerciseLog;
