// src/models/index.js (ACTUALIZADO)
const User = require('./User');
const UserProfile = require('./UserProfile');
const UserContext = require('./UserContext');
const Routine = require('./Routine');
const Exercise = require('./Exercise');
const TrainingSession = require('./TrainingSession');
const ExerciseLog = require('./ExerciseLog');
const FoodLog = require('./FoodLog');
const ActivityLog = require('./ActivityLog');

// ========== ASOCIACIONES ==========

// User <-> UserProfile (1:1)
User.hasOne(UserProfile, { foreignKey: 'user_id', as: 'Profile' });
UserProfile.belongsTo(User, { foreignKey: 'user_id' });

// User <-> UserContext (1:1)
User.hasOne(UserContext, { foreignKey: 'user_id', as: 'Context' });
UserContext.belongsTo(User, { foreignKey: 'user_id' });

// User <-> Routine (1:N)
User.hasMany(Routine, { foreignKey: 'user_id', as: 'Routines' });
Routine.belongsTo(User, { foreignKey: 'user_id' });

// Routine <-> Exercise (1:N)
Routine.hasMany(Exercise, { foreignKey: 'routine_id', as: 'Exercises' });
Exercise.belongsTo(Routine, { foreignKey: 'routine_id' });

// User <-> TrainingSession (1:N)
User.hasMany(TrainingSession, { foreignKey: 'user_id', as: 'Sessions' });
TrainingSession.belongsTo(User, { foreignKey: 'user_id' });

// Routine <-> TrainingSession (1:N)
Routine.hasMany(TrainingSession, { foreignKey: 'routine_id', as: 'Sessions' });
TrainingSession.belongsTo(Routine, { foreignKey: 'routine_id', as: 'Routine' });

// TrainingSession <-> ExerciseLog (1:N)
TrainingSession.hasMany(ExerciseLog, { foreignKey: 'session_id', as: 'ExerciseLogs' });
ExerciseLog.belongsTo(TrainingSession, { foreignKey: 'session_id' });

// Exercise <-> ExerciseLog (1:N)
Exercise.hasMany(ExerciseLog, { foreignKey: 'exercise_id', as: 'Logs' });
ExerciseLog.belongsTo(Exercise, { foreignKey: 'exercise_id', as: 'Exercise' });

// User <-> FoodLog (1:N)
User.hasMany(FoodLog, { foreignKey: 'user_id', as: 'FoodLogs' });
FoodLog.belongsTo(User, { foreignKey: 'user_id' });

// User <-> ActivityLog (1:N)
User.hasMany(ActivityLog, { foreignKey: 'user_id', as: 'ActivityLogs' });
ActivityLog.belongsTo(User, { foreignKey: 'user_id' });

module.exports = {
  User,
  UserProfile,
  UserContext,
  Routine,
  Exercise,
  TrainingSession,
  ExerciseLog,
  FoodLog,
  ActivityLog,
};