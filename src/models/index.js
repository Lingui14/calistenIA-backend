const User = require('./User');
const UserProfile = require('./UserProfile');
const Routine = require('./Routine');
const Exercise = require('./Exercise');
const TrainingSession = require('./TrainingSession');
const ExerciseLog = require('./ExerciseLog');

// ============================================
// ASOCIACIONES
// ============================================

// User <-> UserProfile (1:1)
User.hasOne(UserProfile, { foreignKey: 'user_id', onDelete: 'CASCADE' });
UserProfile.belongsTo(User, { foreignKey: 'user_id' });

// User <-> Routine (1:N)
User.hasMany(Routine, { foreignKey: 'user_id', onDelete: 'CASCADE' });
Routine.belongsTo(User, { foreignKey: 'user_id' });

// Routine <-> Exercise (1:N)
Routine.hasMany(Exercise, { foreignKey: 'routine_id', as: 'Exercises', onDelete: 'CASCADE' });
Exercise.belongsTo(Routine, { foreignKey: 'routine_id' });

// User <-> TrainingSession (1:N)
User.hasMany(TrainingSession, { foreignKey: 'user_id', onDelete: 'CASCADE' });
TrainingSession.belongsTo(User, { foreignKey: 'user_id' });

// Routine <-> TrainingSession (1:N)
Routine.hasMany(TrainingSession, { foreignKey: 'routine_id', as: 'Sessions' });
TrainingSession.belongsTo(Routine, { foreignKey: 'routine_id', as: 'Routine' });

// TrainingSession <-> ExerciseLog (1:N)
TrainingSession.hasMany(ExerciseLog, { foreignKey: 'session_id', as: 'ExerciseLogs' });
ExerciseLog.belongsTo(TrainingSession, { foreignKey: 'session_id' });

// Exercise <-> ExerciseLog (1:N)
Exercise.hasMany(ExerciseLog, { foreignKey: 'exercise_id' });
ExerciseLog.belongsTo(Exercise, { foreignKey: 'exercise_id' });

module.exports = {
  User,
  UserProfile,
  Routine,
  Exercise,
  TrainingSession,
  ExerciseLog,
};
