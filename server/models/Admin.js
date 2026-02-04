const mongoose = require("mongoose");

const AdminSchema = new mongoose.Schema({
  passwordHash: String
});

module.exports = mongoose.model("Admin", AdminSchema);
