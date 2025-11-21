const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const TrainingSession = sequelize.define('TrainingSession', {
  id: { 
    type: DataTypes.UUID, 
    defaultValue: DataTypes.UUIDV4, 
    primaryKey: true 
  },
  user_id: { 
    type: DataTypes.UUID, 
    allowNull: false 
  },
  routine_id: { 
    type: DataTypes.UUID, 
    allowNull: false 
  },
  start_time: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  end_time: DataTypes.DATE,
  total_duration: {
    type: DataTypes.INTEGER, // en minutos
    defaultValue: 0,
  },
  completed: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: false 
  },
}, {
  tableName: 'TrainingSessions',
  timestamps: true,
});

module.exports = TrainingSession;
