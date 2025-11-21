const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(process.env.DB_URL, {
  dialect: 'mysql',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },
  logging: false,
});

async function connectDB() {
  try {
    await sequelize.authenticate();
    console.log('✅ Conectado a MySQL');
    await sequelize.sync({ alter: true });
    console.log('✅ Modelos sincronizados');
  } catch (error) {
    console.error('❌ Error conectando a MySQL:', error);
  }
}

module.exports = { sequelize, connectDB };