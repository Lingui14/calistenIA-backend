const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const FoodLog = sequelize.define('FoodLog', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id: { type: DataTypes.UUID, allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false },
  calories: { type: DataTypes.INTEGER, defaultValue: 0 },
  protein: { type: DataTypes.FLOAT, defaultValue: 0 },
  carbs: { type: DataTypes.FLOAT, defaultValue: 0 },
  fat: { type: DataTypes.FLOAT, defaultValue: 0 },
  meal_type: { type: DataTypes.STRING, defaultValue: 'snack' }, // breakfast, lunch, dinner, snack
  logged_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  notes: { type: DataTypes.TEXT },
});

module.exports = FoodLog;