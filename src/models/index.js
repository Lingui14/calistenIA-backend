const User = require('./User');
const UserProfile = require('./UserProfile');
const Routine = require('./Routine');
const Exercise = require('./Exercise');
const TrainingSession = require('./TrainingSession');
const ExerciseLog = require('./ExerciseLog');

// con solo importarlos, se ejecutan las asociaciones de cada archivo
module.exports = {
  User,
  UserProfile,
  Routine,
  Exercise,
  TrainingSession,
  ExerciseLog,
};
