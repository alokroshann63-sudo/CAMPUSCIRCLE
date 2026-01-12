const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: String,
    email: String,
    password: String,
    age: Number
}, {
    bufferCommands: false // Disable buffering for serverless
});

module.exports = mongoose.model("user", userSchema);