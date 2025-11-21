const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ActivityLog = sequelize.define('ActivityLog', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id: { type: DataTypes.UUID, allowNull: false },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  steps: { type: DataTypes.INTEGER, defaultValue: 0 },
  calories_burned: { type: DataTypes.INTEGER, defaultValue: 0 },
  active_minutes: { type: DataTypes.INTEGER, defaultValue: 0 },
  // Objetivos personalizados
  steps_goal: { type: DataTypes.INTEGER, defaultValue: 10000 },
  calories_goal: { type: DataTypes.INTEGER, defaultValue: 500 },
  minutes_goal: { type: DataTypes.INTEGER, defaultValue: 90 },
});

module.exports = ActivityLog;