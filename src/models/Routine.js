const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const User = require('./User');

const Routine = sequelize.define('Routine', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id: { type: DataTypes.UUID, allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false },
  description: DataTypes.TEXT,
  difficulty_level: DataTypes.STRING,
  is_favorite: { type: DataTypes.BOOLEAN, defaultValue: false },
});

User.hasMany(Routine, { foreignKey: 'user_id' });
Routine.belongsTo(User, { foreignKey: 'user_id' });

module.exports = Routine;
