const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

// ⚠️ APNA MONGODB ATLAS URL YAHAN DALEN
const MONGO_URI = "mongodb+srv://alokdangi2004_db_user:oqHZJjH94hKtrl3t@paytmdb.8kzyge5.mongodb.net/?appName=PaytmDB";

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log("🚀 MongoDB Connected Successfully!");
    try { await mongoose.connection.collection('users').dropIndexes(); } catch (e) {}
  })
  .catch(err => console.log("Database Connection Error:", err));

// Database Schemas
const attemptSchema = new mongoose.Schema({
  testTitle: String,
  score: Number,
  correct: Number,
  wrong: Number,
  unanswered: Number,
  date: { type: Date, default: Date.now }
});

const querySchema = new mongoose.Schema({
  username: String,
  mobile: String,
  question: String,
  answer: { type: String, default: "" },
  status: { type: String, default: "Pending" },
  date: { type: Date, default: Date.now }
});

const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  mobile: { type: String, required: true },
  password: { type: String, required: true },
  role: { type: String, default: 'user' },
  photo: { type: String, default: '' },
  attempts: [attemptSchema],
  queries: [querySchema]
});

const questionSchema = new mongoose.Schema({
  testId: String,
  testTitle: String,
  n: Number,
  text: String,
  options: [{ key: String, text: String }],
  correctAnswer: String
});

const User = mongoose.model('User', userSchema);
const CustomQuestion = mongoose.model('CustomQuestion', questionSchema);

app.get('/', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'index.html'));
});

app.post('/api/signup', async (req, res) => {
  try {
    const { username, mobile, password, role } = req.body;
    if(role === 'admin') {
      const existingAdmin = await User.findOne({ role: 'admin' });
      if(existingAdmin) return res.status(400).json({ success: false, message: "Admin account already exists!" });
    }
    const existingUser = await User.findOne({ mobile });
    if (existingUser) return res.status(400).json({ success: false, message: "Mobile number already registered!" });
    
    const newUser = new User({ username, mobile, password, role: role || 'user', attempts: [], queries: [] });
    await newUser.save();
    res.json({ success: true, message: "Registered successfully!" });
  } catch (err) {
    res.status(400).json({ success: false, message: "Registration error!" });
  }
});

app.post('/api/login', async (req, res) => {
  const { mobile, password } = req.body;
  const user = await User.findOne({ mobile, password });
  if (user) {
    res.json({ success: true, user });
  } else {
    res.status(401).json({ success: false, message: "Invalid Mobile Number or Password!" });
  }
});

app.post('/api/update-photo', async (req, res) => {
  try {
    const { userId, photo } = req.body;
    const user = await User.findByIdAndUpdate(userId, { photo }, { new: true });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error updating photo" });
  }
});

app.post('/api/submit-test', async (req, res) => {
  const { userId, testTitle, score, correct, wrong, unanswered } = req.body;
  try {
    const user = await User.findById(userId);
    user.attempts.push({ testTitle: testTitle || "Mock Paper 1", score, correct, wrong, unanswered, date: new Date() });
    await user.save();
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error submitting test" });
  }
});

app.post('/api/submit-query', async (req, res) => {
  const { userId, question } = req.body;
  try {
    const user = await User.findById(userId);
    user.queries.push({ username: user.username, mobile: user.mobile, question, status: "Pending" });
    await user.save();
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error submitting query" });
  }
});

app.get('/api/admin/users', async (req, res) => {
  try {
    const users = await User.find({ role: 'user' });
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.post('/api/admin/resolve-query', async (req, res) => {
  const { userId, queryId, answer } = req.body;
  try {
    const user = await User.findById(userId);
    const query = user.queries.id(queryId);
    if(query) {
      query.answer = answer;
      query.status = "Resolved";
      await user.save();
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.post('/api/admin/create-test', async (req, res) => {
  try {
    const { testTitle, questions } = req.body;
    const testId = 'test_' + Date.now();
    let docs = questions.map((q, idx) => ({
      testId,
      testTitle,
      n: idx + 1,
      text: q.text,
      options: q.options,
      correctAnswer: q.correctAnswer
    }));
    await CustomQuestion.insertMany(docs);
    res.json({ success: true, message: "Mock test published successfully!" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error creating mock test" });
  }
});

app.get('/api/admin/tests-summary', async (req, res) => {
  try {
    const tests = await CustomQuestion.aggregate([
      { $group: { _id: "$testTitle", count: { $sum: 1 } } }
    ]);
    res.json({ success: true, tests });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.delete('/api/admin/tests/:title', async (req, res) => {
  try {
    const title = decodeURIComponent(req.params.title);
    await CustomQuestion.deleteMany({ testTitle: title });
    res.json({ success: true, message: "Mock test deleted successfully!" });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.post('/api/admin/unlock', async (req, res) => {
  const { userId } = req.body;
  try {
    await User.findByIdAndUpdate(userId, { attempts: [] });
    res.json({ success: true, message: "Attempts reset successfully!" });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.get('/api/tests', async (req, res) => {
  try {
    const tests = await CustomQuestion.distinct('testTitle');
    res.json({ success: true, tests });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.get('/api/tests/:title', async (req, res) => {
  try {
    const title = decodeURIComponent(req.params.title);
    const questions = await CustomQuestion.find({ testTitle: title });
    res.json({ success: true, questions });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.listen(3000, () => {
  console.log("Server running on port http://localhost:3000");
});