const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Routine = sequelize.define('Routine', {
  id: { 
    type: DataTypes.UUID, 
    defaultValue: DataTypes.UUIDV4, 
    primaryKey: true 
  },
  user_id: { 
    type: DataTypes.UUID, 
    allowNull: false 
  },
  name: { 
    type: DataTypes.STRING, 
    allowNull: false 
  },
  description: DataTypes.TEXT,
  difficulty_level: {
    type: DataTypes.STRING,
    defaultValue: 'beginner',
  },
  is_favorite: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: false 
  },
}, {
  tableName: 'Routines',
  timestamps: true,
});

module.exports = Routine;
