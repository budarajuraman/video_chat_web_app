const mongoose = require("mongoose");

const callHistorySchema = new mongoose.Schema({
  roomId: { type: String, required: true },
  users: [
    {
      userId: { type: String, required: true },
      username: { type: String, required: true },
    },
  ],
  startTime: { type: Date, required: true },
  endTime: { type: Date, default: null },
});

const CallHistory = mongoose.model("CallHistory", callHistorySchema);

module.exports = CallHistory;
