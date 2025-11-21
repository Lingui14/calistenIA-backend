const { Sequelize } = require('sequelize');

// Configuración de la conexión a PostgreSQL
const sequelize = new Sequelize(process.env.DB_URL, {
  dialect: 'postgres',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  define: {
    timestamps: true, // createdAt y updatedAt automáticos
    underscored: false, // usar camelCase
  },
});

module.exports = { sequelize };
