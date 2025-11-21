const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const User = require('./User');

const UserProfile = sequelize.define('UserProfile', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: DataTypes.STRING,
  age: DataTypes.INTEGER,
  weight: DataTypes.FLOAT,
  height: DataTypes.FLOAT,
  experience_level: DataTypes.STRING,
  available_equipment: DataTypes.JSON,
  goals: DataTypes.TEXT,
});

User.hasOne(UserProfile, { foreignKey: 'user_id' });
UserProfile.belongsTo(User, { foreignKey: 'user_id' });

module.exports = UserProfile;
