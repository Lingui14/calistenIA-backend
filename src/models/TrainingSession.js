const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const User = require('./User');
const Routine = require('./Routine');

const TrainingSession = sequelize.define('TrainingSession', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id: { type: DataTypes.UUID, allowNull: false },
  routine_id: { type: DataTypes.UUID, allowNull: false },
  start_time: DataTypes.DATE,
  end_time: DataTypes.DATE,
  total_duration: DataTypes.INTEGER,
  completed: { type: DataTypes.BOOLEAN, defaultValue: false },
});

User.hasMany(TrainingSession, { foreignKey: 'user_id' });
TrainingSession.belongsTo(User, { foreignKey: 'user_id' });

Routine.hasMany(TrainingSession, { foreignKey: 'routine_id' });
TrainingSession.belongsTo(Routine, { foreignKey: 'routine_id' });

module.exports = TrainingSession;
