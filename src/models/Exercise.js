const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const Routine = require('./Routine');

const Exercise = sequelize.define('Exercise', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  routine_id: { type: DataTypes.UUID, allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false },
  description: DataTypes.TEXT,
  sets: DataTypes.INTEGER,
  reps: DataTypes.INTEGER,
  rest_time: DataTypes.INTEGER,
  order_index: DataTypes.INTEGER,
});

Routine.hasMany(Exercise, { foreignKey: 'routine_id' });
Exercise.belongsTo(Routine, { foreignKey: 'routine_id' });

module.exports = Exercise;
