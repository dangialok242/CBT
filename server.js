const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

const MONGO_URI = "mongodb+srv://alokdangi2004_db_user:oqHZJjH94hKtrl3t@paytmdb.8kzyge5.mongodb.net/?appName=PaytmDB";

mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000,
})
  .then(async () => {
    console.log("🚀 MongoDB Connected Successfully!");
    try { await mongoose.connection.collection('users').dropIndexes(); } catch (e) {}
    await seedDefaultPapers();
  })
  .catch(err => console.log("Database Connection Error:", err));

const attemptSchema = new mongoose.Schema({
  testTitle: String,
  score: Number,
  correct: Number,
  wrong: Number,
  unanswered: Number,
  mathCorrect: { type: Number, default: 0 },
  reasoningCorrect: { type: Number, default: 0 },
  verbalCorrect: { type: Number, default: 0 },
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
  streak: { type: Number, default: 1 },
  xp: { type: Number, default: 150 },
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

async function seedDefaultPapers() {
  const count1 = await CustomQuestion.countDocuments({ testTitle: 'Mock Paper 1' });
  if (count1 === 0) {
    let docs = defaultQsSeed.map(q => ({ testId: 'paper1', testTitle: 'Mock Paper 1', ...q }));
    await CustomQuestion.insertMany(docs);
  }
  const count2 = await CustomQuestion.countDocuments({ testTitle: 'Mock Paper 2' });
  if (count2 === 0) {
    let docs = mockPaper2Seed.map(q => ({ testId: 'paper2', testTitle: 'Mock Paper 2', ...q }));
    await CustomQuestion.insertMany(docs);
  }
}

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
    res.status(500).json({ success: false, message: "Registration error: " + err.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { mobile, password } = req.body;
    const user = await User.findOne({ mobile, password });
    if (user) {
      res.json({ success: true, user });
    } else {
      res.status(401).json({ success: false, message: "Invalid Mobile Number or Password!" });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: "Server login error: " + err.message });
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
  const { userId, testTitle, score, correct, wrong, unanswered, mathCorrect, reasoningCorrect, verbalCorrect } = req.body;
  try {
    const user = await User.findById(userId);
    user.attempts.push({ 
      testTitle: testTitle || "Mock Paper 1", 
      score, correct, wrong, unanswered, 
      mathCorrect: mathCorrect || 0, 
      reasoningCorrect: reasoningCorrect || 0, 
      verbalCorrect: verbalCorrect || 0, 
      date: new Date() 
    });
    user.xp = (user.xp || 150) + 100;
    user.streak = (user.streak || 1) + 1;
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

app.delete('/api/admin/user-attempt/:userId/:attemptId', async (req, res) => {
  try {
    const { userId, attemptId } = req.params;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    
    user.attempts.id(attemptId).deleteOne();
    await user.save();
    res.json({ success: true, message: "Attempt deleted successfully!" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error deleting attempt" });
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

app.get('/api/admin/test-questions/:title', async (req, res) => {
  try {
    const title = decodeURIComponent(req.params.title);
    const questions = await CustomQuestion.find({ testTitle: title }).sort({ n: 1 });
    res.json({ success: true, questions });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.put('/api/admin/update-question/:id', async (req, res) => {
  try {
    const { text, options, correctAnswer } = req.body;
    await CustomQuestion.findByIdAndUpdate(req.params.id, { text, options, correctAnswer });
    res.json({ success: true, message: "Question updated successfully!" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error updating question" });
  }
});

app.delete('/api/admin/tests/:title', async (req, res) => {
  try {
    const title = decodeURIComponent(req.params.title);
    if(title === 'Mock Paper 1' || title === 'Mock Paper 2') {
      return res.status(400).json({ success: false, message: "Default papers cannot be deleted!" });
    }
    await CustomQuestion.deleteMany({ testTitle: title });
    res.json({ success: true, message: "Mock test deleted successfully!" });
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
    const questions = await CustomQuestion.find({ testTitle: title }).sort({ n: 1 });
    res.json({ success: true, questions });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

const defaultQsSeed = [
    {"n": 1, "text": "What is the smallest 4-digit number exactly divisible by 12?", "options": [{"key": "A", "text": "1000"}, {"key": "B", "text": "1004"}, {"key": "C", "text": "1008"}, {"key": "D", "text": "1012"}], "correctAnswer": "C"},
    {"n": 2, "text": "The sum of the digits of a 2-digit number is 11. If the digits are reversed, the new number is 45 more than the original number. Find the original number.", "options": [{"key": "A", "text": "29"}, {"key": "B", "text": "38"}, {"key": "C", "text": "47"}, {"key": "D", "text": "56"}], "correctAnswer": "B"},
    {"n": 3, "text": "Which of the following numbers is divisible by 11?", "options": [{"key": "A", "text": "2718"}, {"key": "B", "text": "2728"}, {"key": "C", "text": "2738"}, {"key": "D", "text": "2748"}], "correctAnswer": "B"},
    {"n": 4, "text": "A number is exactly divisible by both 8 and 9. By which number is it also always divisible?", "options": [{"key": "A", "text": "12"}, {"key": "B", "text": "18"}, {"key": "C", "text": "36"}, {"key": "D", "text": "72"}], "correctAnswer": "C"},
    {"n": 5, "text": "How many prime numbers lie between 1 and 20?", "options": [{"key": "A", "text": "6"}, {"key": "B", "text": "7"}, {"key": "C", "text": "8"}, {"key": "D", "text": "9"}], "correctAnswer": "B"},
    {"n": 6, "text": "Find the unit digit of 7^95.", "options": [{"key": "A", "text": "1"}, {"key": "B", "text": "3"}, {"key": "C", "text": "7"}, {"key": "D", "text": "9"}], "correctAnswer": "B"},
    {"n": 7, "text": "Simplify: 15 + 6 ÷ 3 × 2 − 4", "options": [{"key": "A", "text": "13"}, {"key": "B", "text": "15"}, {"key": "C", "text": "17"}, {"key": "D", "text": "19"}], "correctAnswer": "A"},
    {"n": 8, "text": "Simplify: (12 × 3 − 6) ÷ 6 + 5", "options": [{"key": "A", "text": "8"}, {"key": "B", "text": "9"}, {"key": "C", "text": "10"}, {"key": "D", "text": "12"}], "correctAnswer": "C"},
    {"n": 9, "text": "Which of the following fractions is the largest?", "options": [{"key": "A", "text": "5/8"}, {"key": "B", "text": "7/10"}, {"key": "C", "text": "3/4"}, {"key": "D", "text": "2/3"}], "correctAnswer": "C"},
    {"n": 10, "text": "Simplify: 2 1/3 + 1 3/4", "options": [{"key": "A", "text": "3 11/12"}, {"key": "B", "text": "4 1/12"}, {"key": "C", "text": "4 1/4"}, {"key": "D", "text": "4 1/6"}], "correctAnswer": "B"},
    {"n": 11, "text": "What is 35% of 480?", "options": [{"key": "A", "text": "148"}, {"key": "B", "text": "158"}, {"key": "C", "text": "168"}, {"key": "D", "text": "178"}], "correctAnswer": "C"},
    {"n": 12, "text": "If 40% of a number is 96, what is the number?", "options": [{"key": "A", "text": "200"}, {"key": "B", "text": "220"}, {"key": "C", "text": "240"}, {"key": "D", "text": "260"}], "correctAnswer": "C"},
    {"n": 13, "text": "The price of an item increased from ₹250 to ₹300. What is the percentage increase?", "options": [{"key": "A", "text": "10%"}, {"key": "B", "text": "15%"}, {"key": "C", "text": "20%"}, {"key": "D", "text": "25%"}], "correctAnswer": "C"},
    {"n": 14, "text": "A number is increased by 20% and then decreased by 20%. What is the net percentage change?", "options": [{"key": "A", "text": "0%"}, {"key": "B", "text": "-2%"}, {"key": "C", "text": "-4%"}, {"key": "D", "text": "+4%"}], "correctAnswer": "C"},
    {"n": 15, "text": "Divide ₹1200 between A and B in the ratio 3 : 5. Find B's share.", "options": [{"key": "A", "text": "₹650"}, {"key": "B", "text": "₹700"}, {"key": "C", "text": "₹750"}, {"key": "D", "text": "₹800"}], "correctAnswer": "C"},
    {"n": 16, "text": "If a : b = 2 : 3 and b : c = 4 : 5, find a : b : c.", "options": [{"key": "A", "text": "2 : 3 : 5"}, {"key": "B", "text": "4 : 6 : 5"}, {"key": "C", "text": "8 : 10 : 15"}, {"key": "D", "text": "8 : 12 : 15"}], "correctAnswer": "D"},
    {"n": 17, "text": "If 8 workers can complete a task in 15 days, how many days will 12 workers take to complete the same task?", "options": [{"key": "A", "text": "8"}, {"key": "B", "text": "9"}, {"key": "C", "text": "10"}, {"key": "D", "text": "12"}], "correctAnswer": "B"},
    {"n": 18, "text": "The average of 5 numbers is 42. If one number is excluded, the average of the remaining numbers becomes 40. Find the excluded number.", "options": [{"key": "A", "text": "45"}, {"key": "B", "text": "48"}, {"key": "C", "text": "50"}, {"key": "D", "text": "52"}], "correctAnswer": "C"},
    {"n": 19, "text": "Find the average of the first 10 natural numbers.", "options": [{"key": "A", "text": "5"}, {"key": "B", "text": "5.5"}, {"key": "C", "text": "6"}, {"key": "D", "text": "4.5"}], "correctAnswer": "B"},
    {"n": 20, "text": "A shopkeeper buys an article for ₹800 and sells it for ₹920. Find his profit percentage.", "options": [{"key": "A", "text": "10%"}, {"key": "B", "text": "12%"}, {"key": "C", "text": "15%"}, {"key": "D", "text": "20%"}], "correctAnswer": "C"},
    {"n": 21, "text": "By selling an item for ₹450, a man loses 10%. What is the cost price of the item?", "options": [{"key": "A", "text": "₹480"}, {"key": "B", "text": "₹490"}, {"key": "C", "text": "₹500"}, {"key": "D", "text": "₹510"}], "correctAnswer": "C"},
    {"n": 22, "text": "A shirt marked at ₹1000 is sold at a discount of 15%. Find the selling price.", "options": [{"key": "A", "text": "₹800"}, {"key": "B", "text": "₹850"}, {"key": "C", "text": "₹870"}, {"key": "D", "text": "₹900"}], "correctAnswer": "B"},
    {"n": 23, "text": "Find the simple interest on ₹15,000 at 8% per annum for 3 years.", "options": [{"key": "A", "text": "₹3200"}, {"key": "B", "text": "₹3600"}, {"key": "C", "text": "₹3800"}, {"key": "D", "text": "₹4000"}], "correctAnswer": "B"},
    {"n": 24, "text": "Find the compound interest on ₹10,000 at 10% per annum for 2 years, compounded annually.", "options": [{"key": "A", "text": "₹2000"}, {"key": "B", "text": "₹2100"}, {"key": "C", "text": "₹2200"}, {"key": "D", "text": "₹2500"}], "correctAnswer": "B"},
    {"n": 25, "text": "The difference between the compound interest and simple interest on a sum for 2 years at 10% per annum is ₹50. Find the sum.", "options": [{"key": "A", "text": "₹4000"}, {"key": "B", "text": "₹5000"}, {"key": "C", "text": "₹5500"}, {"key": "D", "text": "₹6000"}], "correctAnswer": "B"},
    {"n": 26, "text": "A can complete a piece of work in 12 days and B in 18 days. In how many days will they complete the work together?", "options": [{"key": "A", "text": "7 days"}, {"key": "B", "text": "7.2 days"}, {"key": "C", "text": "7.5 days"}, {"key": "D", "text": "8 days"}], "correctAnswer": "B"},
    {"n": 27, "text": "A alone can do a piece of work in 20 days. He worked for 5 days and left. B finished the remaining work in 18 days. In how many days can B alone finish the whole work?", "options": [{"key": "A", "text": "18"}, {"key": "B", "text": "20"}, {"key": "C", "text": "22"}, {"key": "D", "text": "24"}], "correctAnswer": "D"},
    {"n": 28, "text": "Pipe A can fill a tank in 10 hours and pipe B can empty it in 15 hours. If both pipes are opened together, in how many hours will the tank be filled?", "options": [{"key": "A", "text": "20"}, {"key": "B", "text": "25"}, {"key": "C", "text": "30"}, {"key": "D", "text": "35"}], "correctAnswer": "C"},
    {"n": 29, "text": "Two numbers are in the ratio 4 : 5. If each number is increased by 10, the ratio becomes 6 : 7. Find the two numbers.", "options": [{"key": "A", "text": "16 and 20"}, {"key": "B", "text": "20 and 25"}, {"key": "C", "text": "24 and 30"}, {"key": "D", "text": "12 and 15"}], "correctAnswer": "A"},
    {"n": 30, "text": "The average weight of 8 persons increases by 2.5 kg when a new person replaces one of them who weighs 65 kg. Find the weight of the new person.", "options": [{"key": "A", "text": "75 kg"}, {"key": "B", "text": "80 kg"}, {"key": "C", "text": "85 kg"}, {"key": "D", "text": "90 kg"}], "correctAnswer": "B"},
    {"n": 31, "text": "If in a certain code CAT is written as DBU, how is DOG written in that code?", "options": [{"key": "A", "text": "EPG"}, {"key": "B", "text": "EPH"}, {"key": "C", "text": "FPH"}, {"key": "D", "text": "DPH"}], "correctAnswer": "B"},
    {"n": 32, "text": "If PENCIL is coded as QFODJM, how is BOOK coded in the same language?", "options": [{"key": "A", "text": "BPPL"}, {"key": "B", "text": "CPOL"}, {"key": "C", "text": "CPPK"}, {"key": "D", "text": "CPPL"}], "correctAnswer": "D"},
    {"n": 33, "text": "Doctor : Hospital :: Teacher : ?", "options": [{"key": "A", "text": "Book"}, {"key": "B", "text": "Classroom"}, {"key": "C", "text": "School"}, {"key": "D", "text": "Student"}], "correctAnswer": "C"},
    {"n": 34, "text": "Pen : Write :: Knife : ?", "options": [{"key": "A", "text": "Blade"}, {"key": "B", "text": "Cut"}, {"key": "C", "text": "Kitchen"}, {"key": "D", "text": "Sharp"}], "correctAnswer": "B"},
    {"n": 35, "text": "Find the odd one out: Apple, Mango, Potato, Banana", "options": [{"key": "A", "text": "Apple"}, {"key": "B", "text": "Mango"}, {"key": "C", "text": "Potato"}, {"key": "D", "text": "Banana"}], "correctAnswer": "C"},
    {"n": 36, "text": "Find the odd one out: Triangle, Square, Circle, Pyramid", "options": [{"key": "A", "text": "Triangle"}, {"key": "B", "text": "Square"}, {"key": "C", "text": "Circle"}, {"key": "D", "text": "Pyramid"}], "correctAnswer": "D"},
    {"n": 37, "text": "Pointing to a man, a woman said, 'His mother is the only daughter of my mother.' How is the woman related to the man?", "options": [{"key": "A", "text": "Aunt"}, {"key": "B", "text": "Grandmother"}, {"key": "C", "text": "Mother"}, {"key": "D", "text": "Sister"}], "correctAnswer": "C"},
    {"n": 38, "text": "A is B's sister. C is B's mother. D is C's father. How is A related to D?", "options": [{"key": "A", "text": "Daughter"}, {"key": "B", "text": "Granddaughter"}, {"key": "C", "text": "Niece"}, {"key": "D", "text": "Sister"}], "correctAnswer": "B"},
    {"n": 39, "text": "A man walks 5 km towards north, then turns right and walks 3 km, then turns right again and walks 5 km. How far is he from the starting point?", "options": [{"key": "A", "text": "3 km"}, {"key": "B", "text": "5 km"}, {"key": "C", "text": "8 km"}, {"key": "D", "text": "13 km"}], "correctAnswer": "A"},
    {"n": 40, "text": "Ravi walks 10 m towards south, then turns left and walks 5 m, then turns left again and walks 10 m. In which direction is he from the starting point?", "options": [{"key": "A", "text": "North"}, {"key": "B", "text": "South"}, {"key": "C", "text": "East"}, {"key": "D", "text": "West"}], "correctAnswer": "C"},
    {"n": 41, "text": "Find the next term in the series: B, D, F, H, ?", "options": [{"key": "A", "text": "I"}, {"key": "B", "text": "J"}, {"key": "C", "text": "K"}, {"key": "D", "text": "L"}], "correctAnswer": "B"},
    {"n": 42, "text": "Find the missing letter: A, C, F, J, ?", "options": [{"key": "A", "text": "M"}, {"key": "B", "text": "N"}, {"key": "C", "text": "O"}, {"key": "D", "text": "P"}], "correctAnswer": "C"},
    {"n": 43, "text": "Find the next number in the series: 2, 6, 12, 20, 30, ?", "options": [{"key": "A", "text": "36"}, {"key": "B", "text": "40"}, {"key": "C", "text": "42"}, {"key": "D", "text": "44"}], "correctAnswer": "C"},
    {"n": 44, "text": "Find the next term in the series: Z, X, V, T, ?", "options": [{"key": "A", "text": "P"}, {"key": "B", "text": "Q"}, {"key": "C", "text": "R"}, {"key": "D", "text": "S"}], "correctAnswer": "C"},
    {"n": 45, "text": "Introducing a boy, a girl said, 'He is the son of my mother's only daughter.' How is the girl related to the boy?", "options": [{"key": "A", "text": "Aunt"}, {"key": "B", "text": "Cousin"}, {"key": "C", "text": "Mother"}, {"key": "D", "text": "Sister"}], "correctAnswer": "A"},
    {"n": 46, "text": "P is the husband of Q. R is the only son of Q. S is R's sister. How is S related to P?", "options": [{"key": "A", "text": "Daughter"}, {"key": "B", "text": "Niece"}, {"key": "C", "text": "Sister"}, {"key": "D", "text": "Wife"}], "correctAnswer": "A"},
    {"n": 47, "text": "Statement: All pens are pencils. All pencils are erasers. Conclusion I: All pens are erasers. Conclusion II: All erasers are pens. Which conclusion(s) logically follow?", "options": [{"key": "A", "text": "Only I follows"}, {"key": "B", "text": "Only II follows"}, {"key": "C", "text": "Both follow"}, {"key": "D", "text": "Neither follows"}], "correctAnswer": "A"},
    {"n": 48, "text": "Find the missing number in the series: 5, 11, 23, 47, ?", "options": [{"key": "A", "text": "93"}, {"key": "B", "text": "94"}, {"key": "C", "text": "95"}, {"key": "D", "text": "96"}], "correctAnswer": "C"},
    {"n": 49, "text": "If ROSE is coded as 6821, CHAIR as 73456, and PREACH as 961473, what is the code for SEARCH?", "options": [{"key": "A", "text": "214673"}, {"key": "B", "text": "214763"}, {"key": "C", "text": "216473"}, {"key": "D", "text": "241673"}], "correctAnswer": "A"},
    {"n": 50, "text": "Five friends A, B, C, D, E sit in a row facing north. C is immediately to the left of D, and D is second from the left end. B is immediately to the right of A, and E sits at one of the ends. Who sits at the extreme right end?", "options": [{"key": "A", "text": "A"}, {"key": "B", "text": "B"}, {"key": "C", "text": "D"}, {"key": "D", "text": "E"}], "correctAnswer": "B"},
    {"n": 51, "text": "Statements: All books are pens. Some pens are pencils. Conclusion I: Some books are pencils. Conclusion II: Some pencils are books. Which conclusion(s) follow?", "options": [{"key": "A", "text": "Only I follows"}, {"key": "B", "text": "Only II follows"}, {"key": "C", "text": "Both follow"}, {"key": "D", "text": "Neither follows"}], "correctAnswer": "D"},
    {"n": 52, "text": "Statements: No cat is a dog. All dogs are animals. Conclusion I: No cat is an animal. Conclusion II: Some animals are dogs. Which conclusion(s) follow?", "options": [{"key": "A", "text": "Only I follows"}, {"key": "B", "text": "Only II follows"}, {"key": "C", "text": "Both follow"}, {"key": "D", "text": "Neither follows"}], "correctAnswer": "B"},
    {"n": 53, "text": "What is Ram's age? Statement I: Ram is 5 years older than Shyam. Statement II: Shyam is 20 years old.", "options": [{"key": "A", "text": "Statement I alone is sufficient"}, {"key": "B", "text": "Statement II alone is sufficient"}, {"key": "C", "text": "Both statements together are needed"}, {"key": "D", "text": "Neither statement is sufficient"}], "correctAnswer": "C"},
    {"n": 54, "text": "Is x > 0? Statement I: x² = 16. Statement II: x is an even number.", "options": [{"key": "A", "text": "Statement I alone is sufficient"}, {"key": "B", "text": "Statement II alone is sufficient"}, {"key": "C", "text": "Both statements together are sufficient"}, {"key": "D", "text": "Even both statements together are not sufficient"}], "correctAnswer": "D"},
    {"n": 55, "text": "Eight people sit in a row facing north. M is fourth from the left end. There are exactly 3 people between M and N, and N is to the right of M. What is N's position from the left end?", "options": [{"key": "A", "text": "6th"}, {"key": "B", "text": "7th"}, {"key": "C", "text": "8th"}, {"key": "D", "text": "5th"}], "correctAnswer": "C"},
    {"n": 56, "text": "Statement: All doctors are engineers. No engineer is a lawyer. Conclusion I: No doctor is a lawyer. Conclusion II: Some engineers are doctors. Which conclusion(s) follow?", "options": [{"key": "A", "text": "Only I follows"}, {"key": "B", "text": "Only II follows"}, {"key": "C", "text": "Both I and II follow"}, {"key": "D", "text": "Neither follows"}], "correctAnswer": "A"},
    {"n": 57, "text": "Find the part of the sentence that has an error: 'He don't like to play cricket.'", "options": [{"key": "A", "text": "He"}, {"key": "B", "text": "don't like"}, {"key": "C", "text": "to play"}, {"key": "D", "text": "No error"}], "correctAnswer": "B"},
    {"n": 58, "text": "Find the part of the sentence that has an error: 'Neither of the answers are correct.'", "options": [{"key": "A", "text": "Neither of the answers"}, {"key": "B", "text": "are correct"}, {"key": "C", "text": "No error"}, {"key": "D", "text": "Both A and B"}], "correctAnswer": "B"},
    {"n": 59, "text": "Choose the word most nearly SIMILAR in meaning to 'Abundant'.", "options": [{"key": "A", "text": "Scarce"}, {"key": "B", "text": "Limited"}, {"key": "C", "text": "Plentiful"}, {"key": "D", "text": "Rare"}], "correctAnswer": "C"},
    {"n": 60, "text": "Choose the word most nearly SIMILAR in meaning to 'Candid'.", "options": [{"key": "A", "text": "Frank"}, {"key": "B", "text": "Secretive"}, {"key": "C", "text": "Shy"}, {"key": "D", "text": "Dishonest"}], "correctAnswer": "A"},
    {"n": 61, "text": "Choose the word most nearly OPPOSITE in meaning to 'Benevolent'.", "options": [{"key": "A", "text": "Kind"}, {"key": "B", "text": "Generous"}, {"key": "C", "text": "Charitable"}, {"key": "D", "text": "Malevolent"}], "correctAnswer": "D"},
    {"n": 62, "text": "Choose the word most nearly OPPOSITE in meaning to 'Optimistic'.", "options": [{"key": "A", "text": "Hopeful"}, {"key": "B", "text": "Pessimistic"}, {"key": "C", "text": "Cheerful"}, {"key": "D", "text": "Confident"}], "correctAnswer": "B"},
    {"n": 63, "text": "Choose the grammatically correct sentence.", "options": [{"key": "A", "text": "She is going to the market since morning."}, {"key": "B", "text": "She has been going to the market since morning."}, {"key": "C", "text": "She has gone to the market since morning."}, {"key": "D", "text": "She go to the market since morning."}], "correctAnswer": "B"},
    {"n": 64, "text": "Choose the grammatically correct sentence.", "options": [{"key": "A", "text": "Each of the boys have done their work."}, {"key": "B", "text": "Each of the boys has done his work."}, {"key": "C", "text": "Each of the boys has done their work."}, {"key": "D", "text": "Each of the boys have done his work."}], "correctAnswer": "B"},
    {"n": 65, "text": "Choose the correctly spelled word.", "options": [{"key": "A", "text": "Acommodate"}, {"key": "B", "text": "Accomodate"}, {"key": "C", "text": "Accommodate"}, {"key": "D", "text": "Acomodate"}], "correctAnswer": "C"},
    {"n": 66, "text": "Choose the correctly spelled word.", "options": [{"key": "A", "text": "Recieve"}, {"key": "B", "text": "Receive"}, {"key": "C", "text": "Receeve"}, {"key": "D", "text": "Receve"}], "correctAnswer": "B"},
    {"n": 67, "text": "Find the part of the sentence that has an error: 'The number of students in the class have increased.'", "options": [{"key": "A", "text": "The number of students"}, {"key": "B", "text": "in the class"}, {"key": "C", "text": "have increased"}, {"key": "D", "text": "No error"}], "correctAnswer": "C"},
    {"n": 68, "text": "A person who can speak many languages is called:", "options": [{"key": "A", "text": "Linguist"}, {"key": "B", "text": "Bilingual"}, {"key": "C", "text": "Polyglot"}, {"key": "D", "text": "Orator"}], "correctAnswer": "C"},
    {"n": 69, "text": "A place where books are kept for reading is called:", "options": [{"key": "A", "text": "Bookstore"}, {"key": "B", "text": "Library"}, {"key": "C", "text": "Archive"}, {"key": "D", "text": "Museum"}], "correctAnswer": "B"},
    {"n": 70, "text": "Improve the underlined part: 'She is one of the best singer in the group.'", "options": [{"key": "A", "text": "one of best singer"}, {"key": "B", "text": "one of the best singers"}, {"key": "C", "text": "one of the better singer"}, {"key": "D", "text": "no improvement"}], "correctAnswer": "B"},
    {"n": 71, "text": "Choose the word most nearly OPPOSITE in meaning to 'Meticulous'.", "options": [{"key": "A", "text": "Precise"}, {"key": "B", "text": "Thorough"}, {"key": "C", "text": "Detailed"}, {"key": "D", "text": "Careless"}], "correctAnswer": "D"},
    {"n": 72, "text": "The word 'Voracious' most nearly means:", "options": [{"key": "A", "text": "Extremely hungry / eager"}, {"key": "B", "text": "Very tired"}, {"key": "C", "text": "Slightly angry"}, {"key": "D", "text": "Quietly calm"}], "correctAnswer": "A"},
    {"n": 73, "text": "The word 'Ephemeral' most nearly means:", "options": [{"key": "A", "text": "Everlasting"}, {"key": "B", "text": "Short-lived"}, {"key": "C", "text": "Dangerous"}, {"key": "D", "text": "Bright"}], "correctAnswer": "B"},
    {"n": 74, "text": "Choose the correct meaning of the idiom: 'Once in a blue moon'", "options": [{"key": "A", "text": "Very often"}, {"key": "B", "text": "Every month"}, {"key": "C", "text": "Very rarely"}, {"key": "D", "text": "Never"}], "correctAnswer": "C"},
    {"n": 75, "text": "Choose the grammatically correct sentence.", "options": [{"key": "A", "text": "If I was you, I would apologize."}, {"key": "B", "text": "If I were you, I would apologize."}, {"key": "C", "text": "If I am you, I would apologize."}, {"key": "D", "text": "If I would be you, I will apologize."}], "correctAnswer": "B"},
    {"n": 76, "text": "Choose the correct meaning of the idiom: 'To burn the midnight oil'", "options": [{"key": "A", "text": "To waste time"}, {"key": "B", "text": "To work late into the night"}, {"key": "C", "text": "To cause a fire"}, {"key": "D", "text": "To relax at night"}], "correctAnswer": "B"},
    {"n": 77, "text": "Choose the correct meaning of the idiom: 'A blessing in disguise'", "options": [{"key": "A", "text": "A gift that is hidden"}, {"key": "B", "text": "Something bad that stays bad"}, {"key": "C", "text": "Something good that initially seemed bad"}, {"key": "D", "text": "A secret blessing from God"}], "correctAnswer": "C"},
    {"n": 78, "text": "Improve the underlined part: 'Despite of his hard work, he failed the exam.'", "options": [{"key": "A", "text": "Despite of his hard work"}, {"key": "B", "text": "In spite his hard work"}, {"key": "C", "text": "Despite his hard work"}, {"key": "D", "text": "No improvement needed"}], "correctAnswer": "C"},
    {"n": 79, "text": "Choose the word most nearly SIMILAR in meaning to 'Pragmatic'.", "options": [{"key": "A", "text": "Practical"}, {"key": "B", "text": "Idealistic"}, {"key": "C", "text": "Emotional"}, {"key": "D", "text": "Theoretical"}], "correctAnswer": "A"},
    {"n": 80, "text": "Choose the correct meaning of the idiom: 'To let the cat out of the bag'", "options": [{"key": "A", "text": "To adopt a pet"}, {"key": "B", "text": "To reveal a secret"}, {"key": "C", "text": "To create confusion"}, {"key": "D", "text": "To escape from trouble"}], "correctAnswer": "B"}
];

const mockPaper2Seed = [
    {"n": 1, "text": "A town's population of 50,000 increases by 10% in the first year and by 10% in the second year. The population after 2 years is:", "options": [{"key": "A", "text": "61,000"}, {"key": "B", "text": "60,500"}, {"key": "C", "text": "55,000"}, {"key": "D", "text": "60,000"}], "correctAnswer": "B"},
    {"n": 2, "text": "A boat's speed in still water is 10 km/h and the stream flows at 2 km/h. Time taken to go 48 km downstream is:", "options": [{"key": "A", "text": "4.8 hours"}, {"key": "B", "text": "5 hours"}, {"key": "C", "text": "6 hours"}, {"key": "D", "text": "4 hours"}], "correctAnswer": "D"},
    {"n": 3, "text": "8 workers can complete a job in 15 days. How many days will 12 workers take to complete it?", "options": [{"key": "A", "text": "20"}, {"key": "B", "text": "10"}, {"key": "C", "text": "8"}, {"key": "D", "text": "12"}], "correctAnswer": "B"},
    {"n": 4, "text": "Two successive discounts of 20% and 10% are equal to a single discount of:", "options": [{"key": "A", "text": "28%"}, {"key": "B", "text": "25%"}, {"key": "C", "text": "32%"}, {"key": "D", "text": "30%"}], "correctAnswer": "A"},
    {"n": 5, "text": "A can complete a work in 12 days and B in 18 days. Working together, they will complete it in:", "options": [{"key": "A", "text": "6 days"}, {"key": "B", "text": "8 days"}, {"key": "C", "text": "7.2 days"}, {"key": "D", "text": "9 days"}], "correctAnswer": "C"},
    {"n": 6, "text": "A man travels 30 km at 10 km/h and returns at 15 km/h. His average speed for the whole journey is:", "options": [{"key": "A", "text": "11.5 km/h"}, {"key": "B", "text": "13 km/h"}, {"key": "C", "text": "12 km/h"}, {"key": "D", "text": "12.5 km/h"}], "correctAnswer": "C"},
    {"n": 7, "text": "The HCF of 36 and 84 is:", "options": [{"key": "A", "text": "18"}, {"key": "B", "text": "12"}, {"key": "C", "text": "24"}, {"key": "D", "text": "6"}], "correctAnswer": "D"},
    {"n": 8, "text": "A and B invest Rs. 6000 and Rs. 9000 in a business. If the profit is Rs. 7500, A's share is:", "options": [{"key": "A", "text": "Rs. 2500"}, {"key": "B", "text": "Rs. 3000"}, {"key": "C", "text": "Rs. 4500"}, {"key": "D", "text": "Rs. 3500"}], "correctAnswer": "B"},
    {"n": 9, "text": "A father's age is 3 times his son's age. After 12 years, he will be twice as old as his son. The son's present age is:", "options": [{"key": "A", "text": "10 years"}, {"key": "B", "text": "14 years"}, {"key": "C", "text": "12 years"}, {"key": "D", "text": "16 years"}], "correctAnswer": "C"},
    {"n": 10, "text": "If 12 pens cost Rs. 96, the cost of 20 pens is:", "options": [{"key": "A", "text": "Rs. 150"}, {"key": "B", "text": "Rs. 160"}, {"key": "C", "text": "Rs. 180"}, {"key": "D", "text": "Rs. 140"}], "correctAnswer": "B"},
    {"n": 11, "text": "In a class of 60 students, 35 play cricket, 30 play football and 10 play both games. How many students play neither game?", "options": [{"key": "A", "text": "15"}, {"key": "B", "text": "10"}, {"key": "C", "text": "0"}, {"key": "D", "text": "5"}], "correctAnswer": "D"},
    {"n": 12, "text": "3/4 + 5/6 - 1/3 = ?", "options": [{"key": "A", "text": "5/4"}, {"key": "B", "text": "4/3"}, {"key": "C", "text": "7/6"}, {"key": "D", "text": "11/12"}], "correctAnswer": "A"},
    {"n": 13, "text": "A 30-litre mixture contains milk and water in the ratio 2: 1. How much water must be added to make the ratio 1: 1?", "options": [{"key": "A", "text": "15 litres"}, {"key": "B", "text": "5 litres"}, {"key": "C", "text": "10 litres"}, {"key": "D", "text": "20 litres"}], "correctAnswer": "C"},
    {"n": 14, "text": "Simplify: 18 + 12 ÷ 3 × 2 − 5", "options": [{"key": "A", "text": "23"}, {"key": "B", "text": "21"}, {"key": "C", "text": "26"}, {"key": "D", "text": "15"}], "correctAnswer": "B"},
    {"n": 15, "text": "A and B can do a work in 10 days and 15 days respectively. They are paid Rs. 1500 in total. A's share is:", "options": [{"key": "A", "text": "Rs. 600"}, {"key": "B", "text": "Rs. 750"}, {"key": "C", "text": "Rs. 1000"}, {"key": "D", "text": "Rs. 900"}], "correctAnswer": "D"},
    {"n": 16, "text": "Pipe A can fill a tank in 20 minutes and Pipe B in 30 minutes. If both are opened together, the tank will be full in:", "options": [{"key": "A", "text": "25 minutes"}, {"key": "B", "text": "12 minutes"}, {"key": "C", "text": "10 minutes"}, {"key": "D", "text": "15 minutes"}], "correctAnswer": "B"},
    {"n": 17, "text": "0.6 + 0.06 + 0.006 = ?", "options": [{"key": "A", "text": "0.0666"}, {"key": "B", "text": "0.606"}, {"key": "C", "text": "0.66"}, {"key": "D", "text": "0.666"}], "correctAnswer": "D"},
    {"n": 18, "text": "The price of an article is increased by 20% and then decreased by 20%. The net change in price is:", "options": [{"key": "A", "text": "No change"}, {"key": "B", "text": "4% decrease"}, {"key": "C", "text": "4% increase"}, {"key": "D", "text": "2% decrease"}], "correctAnswer": "B"},
    {"n": 19, "text": "A 120 m long train crosses a pole in 6 seconds. Its speed in km/h is:", "options": [{"key": "A", "text": "72"}, {"key": "B", "text": "90"}, {"key": "C", "text": "80"}, {"key": "D", "text": "60"}], "correctAnswer": "A"},
    {"n": 20, "text": "An article bought for Rs. 800 is sold for Rs. 920. The profit percentage is:", "options": [{"key": "A", "text": "15%"}, {"key": "B", "text": "12%"}, {"key": "C", "text": "18%"}, {"key": "D", "text": "20%"}], "correctAnswer": "A"},
    {"n": 21, "text": "Simple interest on Rs. 2500 at 8% per annum for 3 years is:", "options": [{"key": "A", "text": "Rs. 700"}, {"key": "B", "text": "Rs. 600"}, {"key": "C", "text": "Rs. 500"}, {"key": "D", "text": "Rs. 640"}], "correctAnswer": "B"},
    {"n": 22, "text": "25% of 480 + 15% of 200 = ?", "options": [{"key": "A", "text": "150"}, {"key": "B", "text": "130"}, {"key": "C", "text": "140"}, {"key": "D", "text": "160"}], "correctAnswer": "A"},
    {"n": 23, "text": "The LCM of 12, 18 and 30 is:", "options": [{"key": "A", "text": "540"}, {"key": "B", "text": "360"}, {"key": "C", "text": "90"}, {"key": "D", "text": "180"}], "correctAnswer": "D"},
    {"n": 24, "text": "The average of 5 numbers is 27. If one number is excluded, the average of the remaining numbers becomes 25. The excluded number is:", "options": [{"key": "A", "text": "30"}, {"key": "B", "text": "45"}, {"key": "C", "text": "40"}, {"key": "D", "text": "35"}], "correctAnswer": "D"},
    {"n": 25, "text": "Compound interest on Rs. 10000 at 10% per annum for 2 years is:", "options": [{"key": "A", "text": "Rs. 2100"}, {"key": "B", "text": "Rs. 2500"}, {"key": "C", "text": "Rs. 2000"}, {"key": "D", "text": "Rs. 2200"}], "correctAnswer": "A"},
    {"n": 26, "text": "An article marked at Rs. 1200 is sold at a discount of 15%. Its selling price is:", "options": [{"key": "A", "text": "Rs. 1050"}, {"key": "B", "text": "Rs. 1000"}, {"key": "C", "text": "Rs. 1080"}, {"key": "D", "text": "Rs. 1020"}], "correctAnswer": "D"},
    {"n": 27, "text": "If A:B = 3:5 and B:C = 10:7, then A:C = ?", "options": [{"key": "A", "text": "15:7"}, {"key": "B", "text": "5:7"}, {"key": "C", "text": "3:7"}, {"key": "D", "text": "6:7"}], "correctAnswer": "D"},
    {"n": 28, "text": "Two dice are thrown together. The probability that the sum is 8 is:", "options": [{"key": "A", "text": "1/6"}, {"key": "B", "text": "7/36"}, {"key": "C", "text": "5/36"}, {"key": "D", "text": "1/9"}], "correctAnswer": "C"},
    {"n": 29, "text": "Which of the following numbers is divisible by 11?", "options": [{"key": "A", "text": "4567"}, {"key": "B", "text": "2547"}, {"key": "C", "text": "5231"}, {"key": "D", "text": "3828"}], "correctAnswer": "D"},
    {"n": 30, "text": "In how many ways can a committee of 3 be chosen from 7 persons?", "options": [{"key": "A", "text": "210"}, {"key": "B", "text": "42"}, {"key": "C", "text": "21"}, {"key": "D", "text": "35"}], "correctAnswer": "D"},
    {"n": 31, "text": "Pointing to a man, a woman says, \"He is the son of my mother's only brother.\" How is the man related to the woman?", "options": [{"key": "A", "text": "Uncle"}, {"key": "B", "text": "Cousin"}, {"key": "C", "text": "Nephew"}, {"key": "D", "text": "Brother"}], "correctAnswer": "B"},
    {"n": 32, "text": "Ravi is facing North. He turns 90 degrees clockwise and then 135 degrees anticlockwise. In which direction is he facing now?", "options": [{"key": "A", "text": "South-West"}, {"key": "B", "text": "North-East"}, {"key": "C", "text": "North-West"}, {"key": "D", "text": "South-East"}], "correctAnswer": "C"},
    {"n": 33, "text": "If FRIEND is coded as GSJFOE, then how is CANDLE coded?", "options": [{"key": "A", "text": "DCOEMF"}, {"key": "B", "text": "DBMEOF"}, {"key": "C", "text": "EBOEMF"}, {"key": "D", "text": "DBOEMF"}], "correctAnswer": "D"},
    {"n": 34, "text": "P is taller than Q but shorter than R. S is taller than R but shorter than T. Who is the shortest?", "options": [{"key": "A", "text": "Q"}, {"key": "B", "text": "P"}, {"key": "C", "text": "R"}, {"key": "D", "text": "S"}], "correctAnswer": "A"},
    {"n": 35, "text": "Five friends A, B, C, D and E sit in a row facing north. A is at the extreme left. B sits immediately to the right of A. C is at the extreme right. E sits immediately to the left of C. Who sits in the middle?", "options": [{"key": "A", "text": "A"}, {"key": "B", "text": "D"}, {"key": "C", "text": "B"}, {"key": "D", "text": "E"}], "correctAnswer": "B"},
    {"n": 36, "text": "Find the next number in the series: 2, 6, 12, 20, 30, ?", "options": [{"key": "A", "text": "42"}, {"key": "B", "text": "44"}, {"key": "C", "text": "40"}, {"key": "D", "text": "36"}], "correctAnswer": "A"},
    {"n": 37, "text": "If A=1, B=2, C=3, ... and so on, what is the value of DOG?", "options": [{"key": "A", "text": "26"}, {"key": "B", "text": "30"}, {"key": "C", "text": "24"}, {"key": "D", "text": "28"}], "correctAnswer": "A"},
    {"n": 38, "text": "Which word comes third when the following words are arranged in alphabetical order? Garden, Gentle, Gamble, Gather, Gauge", "options": [{"key": "A", "text": "Gauge"}, {"key": "B", "text": "Gather"}, {"key": "C", "text": "Gentle"}, {"key": "D", "text": "Garden"}], "correctAnswer": "B"},
    {"n": 39, "text": "In how many ways can the letters of the word LEADER be arranged?", "options": [{"key": "A", "text": "720"}, {"key": "B", "text": "360"}, {"key": "C", "text": "180"}, {"key": "D", "text": "120"}], "correctAnswer": "B"},
    {"n": 40, "text": "Question: Is the integer x even? I. x+3 is odd. II. x is a multiple of 3.", "options": [{"key": "A", "text": "Statement I alone is sufficient"}, {"key": "B", "text": "Statement II alone is sufficient"}, {"key": "C", "text": "Both statements together are sufficient"}, {"key": "D", "text": "Both statements together are not sufficient"}], "correctAnswer": "A"},
    {"n": 41, "text": "Find the next number in the series: 3, 7, 15, 31, 63, ?", "options": [{"key": "A", "text": "115"}, {"key": "B", "text": "127"}, {"key": "C", "text": "131"}, {"key": "D", "text": "125"}], "correctAnswer": "B"},
    {"n": 42, "text": "Statements: All cats are dogs. All dogs are birds. Conclusions: I. All cats are birds. II. Some birds are cats.", "options": [{"key": "A", "text": "Only I follows"}, {"key": "B", "text": "Only II follows"}, {"key": "C", "text": "Both I and II follow"}, {"key": "D", "text": "Neither I nor II follows"}], "correctAnswer": "C"},
    {"n": 43, "text": "Statements: Some doctors are teachers. All teachers are singers. Conclusions: I. Some doctors are singers. II. All singers are teachers.", "options": [{"key": "A", "text": "Only I follows"}, {"key": "B", "text": "Only II follows"}, {"key": "C", "text": "Both I and II follow"}, {"key": "D", "text": "Neither I nor II follows"}], "correctAnswer": "A"},
    {"n": 44, "text": "Arrange sentences: P. Ravi was walking to the office. Q. Suddenly it started raining heavily. R. As he had no umbrella, he returned home. S. He took an umbrella and left again.", "options": [{"key": "A", "text": "SRQP"}, {"key": "B", "text": "PRQS"}, {"key": "C", "text": "QPRS"}, {"key": "D", "text": "PQRS"}], "correctAnswer": "D"},
    {"n": 45, "text": "Find the next letter in the series: A, C, F, J, O, ?", "options": [{"key": "A", "text": "T"}, {"key": "B", "text": "U"}, {"key": "C", "text": "S"}, {"key": "D", "text": "V"}], "correctAnswer": "B"},
    {"n": 46, "text": "Rearrange the parts: P. to school Q. every day R. she goes S. by bus", "options": [{"key": "A", "text": "PRQS"}, {"key": "B", "text": "RQPS"}, {"key": "C", "text": "RPSQ"}, {"key": "D", "text": "SRPQ"}], "correctAnswer": "C"},
    {"n": 47, "text": "Find the missing number: 4, 9, 19, 39, ?, 159", "options": [{"key": "A", "text": "78"}, {"key": "B", "text": "69"}, {"key": "C", "text": "89"}, {"key": "D", "text": "79"}], "correctAnswer": "D"},
    {"n": 48, "text": "Arrange in a meaningful order: 1. Flower 2. Seed 3. Fruit 4. Plant 5. Sapling", "options": [{"key": "A", "text": "52413"}, {"key": "B", "text": "25413"}, {"key": "C", "text": "25143"}, {"key": "D", "text": "24513"}], "correctAnswer": "B"},
    {"n": 49, "text": "Choose the odd one out: 27, 64, 125, 100", "options": [{"key": "A", "text": "125"}, {"key": "B", "text": "100"}, {"key": "C", "text": "27"}, {"key": "D", "text": "64"}], "correctAnswer": "B"},
    {"n": 50, "text": "A is B's sister. C is B's mother. D is C's father. How is A related to D?", "options": [{"key": "A", "text": "Grandmother"}, {"key": "B", "text": "Niece"}, {"key": "C", "text": "Daughter"}, {"key": "D", "text": "Granddaughter"}], "correctAnswer": "D"},
    {"n": 51, "text": "8 : 64 :: 9 : ?", "options": [{"key": "A", "text": "81"}, {"key": "B", "text": "99"}, {"key": "C", "text": "72"}, {"key": "D", "text": "27"}], "correctAnswer": "A"},
    {"n": 52, "text": "Statement: Should plastic bags be banned? Arguments: I. Yes, because they cause serious pollution. II. No, because they are cheap.", "options": [{"key": "A", "text": "Only argument I is strong"}, {"key": "B", "text": "Only argument II is strong"}, {"key": "C", "text": "Both I and II are strong"}, {"key": "D", "text": "Neither I nor II is strong"}], "correctAnswer": "A"},
    {"n": 53, "text": "Book : Reading :: Fork : ?", "options": [{"key": "A", "text": "Eating"}, {"key": "B", "text": "Cooking"}, {"key": "C", "text": "Cutting"}, {"key": "D", "text": "Serving"}], "correctAnswer": "A"},
    {"n": 54, "text": "In a certain code, 'red blue green' is written as 'ka la ma', 'blue green yellow' as 'la ma na', and 'red yellow white' as 'ka na pa'. What is the code for 'red'?", "options": [{"key": "A", "text": "ma"}, {"key": "B", "text": "la"}, {"key": "C", "text": "ka"}, {"key": "D", "text": "na"}], "correctAnswer": "C"},
    {"n": 55, "text": "Find the next term: A1, C3, E5, G7, ?", "options": [{"key": "A", "text": "J10"}, {"key": "B", "text": "H8"}, {"key": "C", "text": "I8"}, {"key": "D", "text": "I9"}], "correctAnswer": "D"},
    {"n": 56, "text": "Choose the word opposite in meaning to ABUNDANT:", "options": [{"key": "A", "text": "Plentiful"}, {"key": "B", "text": "Rich"}, {"key": "C", "text": "Ample"}, {"key": "D", "text": "Scarce"}], "correctAnswer": "D"},
    {"n": 57, "text": "Choose the correctly spelt word:", "options": [{"key": "A", "text": "Accomodation"}, {"key": "B", "text": "Accommodation"}, {"key": "C", "text": "Acommodation"}, {"key": "D", "text": "Acomodation"}], "correctAnswer": "B"},
    {"n": 58, "text": "Choose the word opposite in meaning to EXPAND:", "options": [{"key": "A", "text": "Grow"}, {"key": "B", "text": "Spread"}, {"key": "C", "text": "Enlarge"}, {"key": "D", "text": "Contract"}], "correctAnswer": "D"},
    {"n": 59, "text": "What does the idiom \"To spill the beans\" mean?", "options": [{"key": "A", "text": "To cook badly"}, {"key": "B", "text": "To reveal a secret"}, {"key": "C", "text": "To waste food"}, {"key": "D", "text": "To make a mess"}], "correctAnswer": "B"},
    {"n": 60, "text": "One word for: A person who can speak two languages", "options": [{"key": "A", "text": "Linguist"}, {"key": "B", "text": "Orator"}, {"key": "C", "text": "Bilingual"}, {"key": "D", "text": "Polyglot"}], "correctAnswer": "C"},
    {"n": 61, "text": "Read the passage: Technology has changed communication. Earlier letters took days; now messages arrive in seconds. However, constant connectivity has reduced face-to-face interaction. Main idea?", "options": [{"key": "A", "text": "Letters are better than messages"}, {"key": "B", "text": "Technology has changed communication, with both benefits and drawbacks"}, {"key": "C", "text": "Technology is completely harmful"}, {"key": "D", "text": "Face-to-face interaction has increased"}], "correctAnswer": "B"},
    {"n": 62, "text": "According to the passage, what has reduced due to constant connectivity?", "options": [{"key": "A", "text": "Number of letters"}, {"key": "B", "text": "Speed of messages"}, {"key": "C", "text": "Face-to-face interaction"}, {"key": "D", "text": "Use of technology"}], "correctAnswer": "C"},
    {"n": 63, "text": "Change into passive voice: The teacher praised the student.", "options": [{"key": "A", "text": "The student has been praised by the teacher."}, {"key": "B", "text": "The student was praised by the teacher."}, {"key": "C", "text": "The teacher was praised by the student."}, {"key": "D", "text": "The student is praised by the teacher."}], "correctAnswer": "B"},
    {"n": 64, "text": "Choose the word closest in meaning to OBSOLETE:", "options": [{"key": "A", "text": "Useful"}, {"key": "B", "text": "Rare"}, {"key": "C", "text": "Outdated"}, {"key": "D", "text": "Modern"}], "correctAnswer": "C"},
    {"n": 65, "text": "What does the idiom \"Once in a blue moon\" mean?", "options": [{"key": "A", "text": "Very rarely"}, {"key": "B", "text": "At night"}, {"key": "C", "text": "Never ever"}, {"key": "D", "text": "Very frequently"}], "correctAnswer": "A"},
    {"n": 66, "text": "The lawyer's arguments were so ___ that the judge was immediately convinced.", "options": [{"key": "A", "text": "vague"}, {"key": "B", "text": "weak"}, {"key": "C", "text": "compelling"}, {"key": "D", "text": "feeble"}], "correctAnswer": "C"},
    {"n": 67, "text": "Improve the sentence: He is senior than me.", "options": [{"key": "A", "text": "senior to me"}, {"key": "B", "text": "No improvement"}, {"key": "C", "text": "seniorer than me"}, {"key": "D", "text": "more senior than me"}], "correctAnswer": "A"},
    {"n": 68, "text": "One word for: The study of ancient societies through excavation of remains", "options": [{"key": "A", "text": "Geology"}, {"key": "B", "text": "Zoology"}, {"key": "C", "text": "Anthropology"}, {"key": "D", "text": "Archaeology"}], "correctAnswer": "D"},
    {"n": 69, "text": "Choose the correct sentence:", "options": [{"key": "A", "text": "He gone to school daily."}, {"key": "B", "text": "He go to school daily."}, {"key": "C", "text": "He goes to school daily."}, {"key": "D", "text": "He going to school daily."}], "correctAnswer": "C"},
    {"n": 70, "text": "Choose the word opposite in meaning to VERBOSE:", "options": [{"key": "A", "text": "Concise"}, {"key": "B", "text": "Wordy"}, {"key": "C", "text": "Fluent"}, {"key": "D", "text": "Loud"}], "correctAnswer": "A"},
    {"n": 71, "text": "Choose the word closest in meaning to BENEVOLENT:", "options": [{"key": "A", "text": "Kind"}, {"key": "B", "text": "Cruel"}, {"key": "C", "text": "Angry"}, {"key": "D", "text": "Stingy"}], "correctAnswer": "A"},
    {"n": 72, "text": "Choose the word closest in meaning to CANDID:", "options": [{"key": "A", "text": "Rude"}, {"key": "B", "text": "Shy"}, {"key": "C", "text": "Secretive"}, {"key": "D", "text": "Frank"}], "correctAnswer": "D"},
    {"n": 73, "text": "Fill in the blank: She is very good ___ mathematics.", "options": [{"key": "A", "text": "at"}, {"key": "B", "text": "in"}, {"key": "C", "text": "with"}, {"key": "D", "text": "on"}], "correctAnswer": "A"},
    {"n": 74, "text": "Fill in the blanks: The manager was ___ with the team for their ___ performance.", "options": [{"key": "A", "text": "angry, excellent"}, {"key": "B", "text": "pleased, poor"}, {"key": "C", "text": "pleased, excellent"}, {"key": "D", "text": "angry, outstanding"}], "correctAnswer": "C"},
    {"n": 75, "text": "Change into passive voice: They are building a new bridge.", "options": [{"key": "A", "text": "A new bridge has been built by them."}, {"key": "B", "text": "A new bridge was built by them."}, {"key": "C", "text": "A new bridge is built by them."}, {"key": "D", "text": "A new bridge is being built by them."}], "correctAnswer": "D"},
    {"n": 76, "text": "Find the part of the sentence that has an error: She (A) / don't like (B) / to play cricket. (C) / No error (D)", "options": [{"key": "A", "text": "A"}, {"key": "B", "text": "B"}, {"key": "C", "text": "C"}, {"key": "D", "text": "D"}], "correctAnswer": "B"},
    {"n": 77, "text": "One word for: Government by the people", "options": [{"key": "A", "text": "Monarchy"}, {"key": "B", "text": "Aristocracy"}, {"key": "C", "text": "Democracy"}, {"key": "D", "text": "Autocracy"}], "correctAnswer": "C"},
    {"n": 78, "text": "What does the idiom \"A piece of cake\" mean?", "options": [{"key": "A", "text": "Something very easy"}, {"key": "B", "text": "A small portion"}, {"key": "C", "text": "A gift"}, {"key": "D", "text": "A dessert"}], "correctAnswer": "A"},
    {"n": 79, "text": "A man walks 5 km towards the north, turns right and walks 3 km, then turns right again and walks 5 km. How far and in which direction is he from his starting point?", "options": [{"key": "A", "text": "5 km East"}, {"key": "B", "text": "13 km North"}, {"key": "C", "text": "3 km East"}, {"key": "D", "text": "3 km West"}], "correctAnswer": "C"},
    {"n": 80, "text": "What is Ravi's age? I. Ravi is 5 years older than Sita. II. Sita is 20 years old.", "options": [{"key": "A", "text": "Statement I alone is sufficient"}, {"key": "B", "text": "Statement II alone is sufficient"}, {"key": "C", "text": "Both statements together are sufficient"}, {"key": "D", "text": "Both statements together are not sufficient"}], "correctAnswer": "C"}
];

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});