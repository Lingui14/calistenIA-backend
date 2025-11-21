const router = require('express').Router();
const auth = require('../middlewares/auth');
const TrainingSession = require('../models/TrainingSession');
const ExerciseLog = require('../models/ExerciseLog');

router.post('/', auth, async (req, res) => {
  const { routineId } = req.body;
  const session = await TrainingSession.create({
    user_id: req.user.id,
    routine_id: routineId,
    start_time: new Date(),
    completed: false,
  });
  res.json(session);
});

router.post('/:id/logs', auth, async (req, res) => {
  const { exerciseId, completedSets, completedReps } = req.body;
  const log = await ExerciseLog.create({
    session_id: req.params.id,
    exercise_id: exerciseId,
    completed_sets: completedSets,
    completed_reps: completedReps,
  });
  res.json(log);
});

router.patch('/:id/finish', auth, async (req, res) => {
  const session = await TrainingSession.findByPk(req.params.id);
  session.end_time = new Date();
  session.completed = true;
  // duración simple
  session.total_duration =
    (session.end_time.getTime() - session.start_time.getTime()) / 1000;
  await session.save();
  res.json(session);
});

module.exports = router;
