const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const UserProfile = sequelize.define('UserProfile', {
  id: { 
    type: DataTypes.UUID, 
    defaultValue: DataTypes.UUIDV4, 
    primaryKey: true 
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  name: DataTypes.STRING,
  age: DataTypes.INTEGER,
  weight: DataTypes.FLOAT,
  height: DataTypes.FLOAT,
  experience_level: {
    type: DataTypes.STRING,
    defaultValue: 'beginner',
  },
  available_equipment: {
    type: DataTypes.JSON,
    defaultValue: [],
  },
  goals: DataTypes.TEXT,
}, {
  tableName: 'UserProfiles',
  timestamps: true,
});

module.exports = UserProfile;
