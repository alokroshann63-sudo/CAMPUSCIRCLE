// 1. Env Variables Load karo (Sabse Pehle)
require('dotenv').config();

const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const Ably = require("ably");
const bcrypt = require('bcrypt');
const { dbConnect } = require('./lib/mongoose');
const userModel = require('./user');

const app = express();

app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser());

// 2. JWT Secret (.env se)
const JWT_SECRET = process.env.JWT_SECRET || "fallbackSecretKey";

// 3. Ably Setup (Ab .env se lega)
const ablyApiKey = process.env.ABLY_API_KEY;
if (!ablyApiKey) {
    console.error("❌ ERROR: ABLY_API_KEY missing in .env file");
    process.exit(1);
}
const ably = new Ably.Rest(ablyApiKey);

/* ================= ROUTES ================= */

app.get('/', (req, res) => {
    res.sendFile("public/fusi.html", { root: __dirname });
});

/* --- Authentication --- */
app.get('/create', (req, res) => {
    res.render('create', { error: req.query.error });
});

app.post('/create', async (req, res) => {
    try {
        // Connect to database before querying
        await dbConnect();
        
        let { username, email, password, age } = req.body;
        if (!username || !email || !password || !age) return res.redirect("/?error=emptyfields");

        age = Number(age);
        if (isNaN(age) || age < 18 || age > 100) return res.redirect("/?error=invalidage");

        let exists = await userModel.findOne({ email });
        if (exists) return res.redirect("/?error=emailexists");

        const hash = await bcrypt.hash(password, 10);
        await userModel.create({ username, email, password: hash, age });

        res.redirect("/login");
    } catch (error) {
        console.error("❌ Signup Error:", process.env.NODE_ENV === 'production' ? error.message : error);
        res.redirect("/?error=servererror");
    }
});

app.get("/login", (req, res) => {
    res.render('login', { error: req.query.error });
});

app.post("/login", async (req, res) => {
    try {
        // Connect to database before querying
        await dbConnect();
        
        let { email, password } = req.body;
        if (!email || !password) return res.redirect("/login?error=emptyfields");

        let user = await userModel.findOne({ email });
        if (!user) return res.redirect("/?error=notfound");

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.redirect("/login?error=wrongpassword");

        // Yahan humne process.env.JWT_SECRET use kiya hai
        let token = jwt.sign({ email: user.email }, JWT_SECRET);
        
        res.cookie("token", token);
        res.redirect("/chatting");
    } catch (error) {
        console.error("❌ Login Error:", process.env.NODE_ENV === 'production' ? error.message : error);
        res.redirect("/login?error=servererror");
    }
});

app.get("/logout", (req, res) => {
    res.cookie("token", "");
    res.redirect("/create");
});

/* --- Pages --- */
app.get('/chatting', (req, res) => {
    res.sendFile("public/chatting.html", { root: __dirname });
});

app.get('/chatbot', (req, res) => {
    res.sendFile("public/chatbot.html", { root: __dirname });
});

/* --- Chatbot Logic --- */
app.post("/chatbot", async (req, res) => {
    try {
        const userMessage = req.body.message;
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${process.env.API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{
                        role: "user",
                        parts: [{ text: `You are CampusCircle Assistant. Help students with campus events, academics, and tech. Keep it simple. Student: ${userMessage}` }]
                    }]
                })
            }
        );

        const data = await response.json();
        if (data.error) return res.status(500).json({ reply: `API Error: ${data.error.message}` });

        let reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";
        res.json({ reply });

    } catch (err) {
        console.error("FETCH ERROR:", err);
        res.status(500).json({ reply: "Server error." });
    }
});

/* --- Ably Token Route --- */
app.get('/token', async (req, res) => {
    const clientId = req.query.clientId || 'anonymous';
    try {
        const tokenRequestData = await ably.auth.createTokenRequest({ clientId: clientId });
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(tokenRequestData));
    } catch (err) {
        console.error("Ably Auth Error:", err);
        res.status(500).send("Error generating token: " + err.message);
    }
});

/* --- Start Server --- */
app.listen(3000, () => {
    console.log("✅ Server running at http://localhost:3000");
});
