# CalistenIA - Backend

API REST para la aplicación de fitness CalistenIA. Desarrollado con Node.js, Express y MySQL, desplegado en Railway.

## Descripción

Backend que proporciona servicios de autenticación, gestión de rutinas, integración con IA (Grok/xAI) para generación de entrenamientos y chat, análisis nutricional de imágenes, y conexión con Spotify.

## Características principales

- **Autenticación JWT**: Registro, login y protección de rutas
- **Generación de rutinas con IA**: Integración con Grok (xAI) para crear entrenamientos personalizados
- **Chat inteligente**: Conversaciones con IA incluyendo function calling para acciones contextuales
- **Análisis de comidas**: Procesamiento de imágenes con visión de IA para estimar macros
- **Tracking de entrenamientos**: Registro de sesiones, ejercicios completados y progreso
- **Integración Spotify**: OAuth y búsqueda de playlists de workout
- **Registro de actividad**: Pasos, calorías y minutos activos

## Tecnologías

| Categoría | Tecnología |
|-----------|------------|
| Runtime | Node.js |
| Framework | Express 5 |
| Base de datos | MySQL |
| ORM | Sequelize 6 |
| Autenticación | JWT (jsonwebtoken) |
| Seguridad | Helmet, bcryptjs |
| Validación | Joi |
| IA | Grok API (xAI) |
| Hosting | Railway |

## Estructura del proyecto

```
├── src/
│   ├── index.js              # Punto de entrada
│   ├── config/
│   │   └── db.js             # Configuración Sequelize/MySQL
│   ├── models/               # Modelos de base de datos
│   │   ├── index.js          # Asociaciones
│   │   ├── User.js
│   │   ├── UserProfile.js
│   │   ├── UserContext.js
│   │   ├── Routine.js
│   │   ├── Exercise.js
│   │   ├── TrainingSession.js
│   │   ├── ExerciseLog.js
│   │   ├── FoodLog.js
│   │   └── ActivityLog.js
│   ├── routes/               # Endpoints API
│   │   ├── auth.js           # /api/auth
│   │   ├── profile.js        # /api/profile
│   │   ├── routines.js       # /api/routines
│   │   ├── routines-ai.js    # /api/routines (generación IA)
│   │   ├── training.js       # /api/training
│   │   ├── food.js           # /api/food
│   │   ├── activity.js       # /api/activity
│   │   ├── chat.js           # /api/chat
│   │   └── spotify.js        # /api/spotify
│   └── middlewares/
│       └── auth.js           # Verificación JWT
├── package.json
└── .env                      # Variables de entorno (no incluido)
```

## API Endpoints

### Autenticación
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/auth/register` | Registro de usuario |
| POST | `/api/auth/login` | Inicio de sesión |
| GET | `/api/auth/me` | Usuario actual (auth) |

### Perfil
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/profile/me` | Obtener perfil |
| PUT | `/api/profile/me` | Actualizar perfil |
| PATCH | `/api/profile/equipment` | Actualizar equipo disponible |

### Rutinas
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/routines` | Listar rutinas del usuario |
| GET | `/api/routines/active` | Obtener rutina activa |
| GET | `/api/routines/:id` | Detalle de rutina |
| POST | `/api/routines/generate-ai` | Generar rutina con IA |
| POST | `/api/routines/smart-generate` | Generación inteligente contextual |
| DELETE | `/api/routines/:id` | Eliminar rutina |

### Entrenamiento
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/training/start` | Iniciar sesión |
| POST | `/api/training/log-exercise` | Registrar ejercicio |
| POST | `/api/training/complete` | Completar sesión |
| GET | `/api/training/history` | Historial de entrenamientos |

### Alimentación
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/food` | Listar registros de comida |
| POST | `/api/food` | Agregar comida manual |
| POST | `/api/food/analyze` | Analizar imagen con IA |
| DELETE | `/api/food/:id` | Eliminar registro |

### Chat
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/chat/message` | Enviar mensaje al asistente IA |

### Actividad
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/activity/today` | Actividad del día |
| PUT | `/api/activity/today` | Actualizar actividad |
| GET | `/api/activity/week` | Resumen semanal |

### Spotify
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/spotify/auth-url` | URL de autorización OAuth |
| POST | `/api/spotify/callback` | Callback OAuth |
| GET | `/api/spotify/playlists` | Buscar playlists de workout |

### Health Check
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/ping` | Verificar estado del servidor |

## Modelos de datos

### User
Usuario base con email y contraseña hasheada.

### UserProfile
Perfil extendido: nombre, edad, peso, altura, nivel de experiencia, equipo disponible, objetivos.

### UserContext
Preferencias de entrenamiento: duración, intensidad, ejercicios favoritos/evitados, lesiones, tokens de Spotify.

### Routine
Rutina de ejercicios con nombre, descripción y nivel de dificultad.

### Exercise
Ejercicios individuales con soporte para múltiples tipos:
- **Standard**: Sets x Reps con descanso
- **HIIT**: Tiempo trabajo/descanso + rondas
- **AMRAP**: Duración total en segundos
- **EMOM**: Duración por minuto

### TrainingSession / ExerciseLog
Sesiones de entrenamiento completadas con registro detallado por ejercicio.

### FoodLog
Registro de comidas con macronutrientes (calorías, proteína, carbohidratos, grasa).

### ActivityLog
Actividad diaria: pasos, calorías quemadas, minutos activos.

## Instalación

### Prerrequisitos

- Node.js 18+
- MySQL 8+
- Cuenta en xAI para API de Grok

### Pasos

1. Clonar el repositorio:
```bash
git clone https://github.com/Lingui14/calistenIA-backend.git
cd calistenIA-backend
```

2. Instalar dependencias:
```bash
npm install
```

3. Configurar variables de entorno:
```bash
cp .env.example .env
# Editar .env con tus credenciales
```

4. Iniciar en desarrollo:
```bash
npm run dev
```

## Variables de entorno

```env
# Base de datos
DB_HOST=localhost
DB_PORT=3306
DB_NAME=calistenia
DB_USER=root
DB_PASSWORD=

# JWT
JWT_SECRET=tu_secreto_jwt
JWT_EXPIRES=7d

# xAI / Grok
REACT_APP_XAI_API_KEY=tu_api_key_xai

# Spotify (opcional)
SPOTIFY_CLIENT_ID=tu_client_id
SPOTIFY_CLIENT_SECRET=tu_client_secret
SPOTIFY_REDIRECT_URI=https://tu-backend.com/api/spotify/callback

# Server
PORT=4000
```

## Scripts disponibles

| Comando | Descripción |
|---------|-------------|
| `npm start` | Inicia servidor en producción |
| `npm run dev` | Inicia con nodemon (desarrollo) |

## Despliegue en Railway

El backend está configurado para Railway con MySQL:

1. Crear proyecto en Railway
2. Agregar servicio MySQL
3. Conectar repositorio de GitHub
4. Configurar variables de entorno
5. Deploy automático en cada push a main

URL de producción: `https://calistenia-backend-production.up.railway.app`

## Integración con IA (Grok)

### Generación de rutinas
El sistema utiliza prompts estructurados para generar rutinas de calistenia con énfasis en entrenamientos estilo Navy SEAL (HIIT, AMRAP, EMOM).

### Chat con function calling
El chat soporta funciones ejecutables:
- `generate_routine`: Crear nueva rutina desde el chat
- `get_routines`: Listar rutinas del usuario
- `get_profile`: Obtener información del perfil

### Análisis de imágenes
Endpoint `/api/food/analyze` procesa imágenes de comida y devuelve estimación de macronutrientes.

## Seguridad

- Contraseñas hasheadas con bcrypt
- Tokens JWT con expiración configurable
- Helmet para headers HTTP seguros
- CORS habilitado
- Validación de entrada con Joi

## Contribuir

1. Fork del repositorio
2. Crear rama feature: `git checkout -b feature/nueva-funcionalidad`
3. Commit cambios: `git commit -m 'Agregar nueva funcionalidad'`
4. Push a la rama: `git push origin feature/nueva-funcionalidad`
5. Abrir Pull Request

## Autor

Alessio y Carlos - [@Sebastiux] [@Lingui14](https://github.com/Lingui14)

## Licencia

Este proyecto está bajo licencia privada.
