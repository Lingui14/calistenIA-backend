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
    defaultValue: 60, // segundos
  },
  order_index: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
}, {
  tableName: 'Exercises',
  timestamps: true,
});

module.exports = Exercise;
