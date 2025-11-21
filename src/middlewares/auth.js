const jwt = require('jsonwebtoken');

/**
 * Middleware de autenticación
 * Verifica el token JWT y agrega req.user
 */
module.exports = function auth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ message: 'Token no proporcionado' });
    }

    // Formato esperado: "Bearer <token>"
    const parts = authHeader.split(' ');
    
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({ message: 'Formato de token inválido' });
    }

    const token = parts[1];
    
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    
    // Agregar usuario al request
    req.user = { id: payload.id };
    
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expirado' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Token inválido' });
    }
    
    console.error('Error en middleware auth:', err);
    return res.status(401).json({ message: 'Error de autenticación' });
  }
};
