const express = require("express");
const app = express();
const server = require("http").Server(app);
const { v4: uuidv4 } = require("uuid");
const User = require('./models/User');
const CallHistory = require('./models/CallHistory');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const { ExpressPeerServer } = require("peer");

const io = require("socket.io")(server, {
  cors: {
    origin: '*',
  },
});

const opinions = {
  debug: true,
};

// Middleware setup
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(cookieParser());
app.set("view engine", "ejs");

mongoose.connect('mongodb://localhost:27017/signupDB', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch((error) => console.log(error));

// JWT secret
const JWT_SECRET = "your_jwt_secret_key";

function authenticateUser(req, res, next) {
  const token = req.cookies.User;
  if (!token) {
    return res.redirect("/");
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.redirect("/");
  }
}

// PeerJS server setup
app.use("/peerjs", ExpressPeerServer(server, opinions));

app.get("/", (req, res) => {
  const token = req.cookies.User;
  if (token) {
    return res.redirect("/dashboard");
  }
  return res.render("login");
});

app.get("/signup", (req, res) => {
  res.render("signup");
});

app.post("/signup", async (req, res) => {
  const { username, email, password } = req.body;
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.render("signup", { message: 'Email is already registered' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = new User({
    name: username,
    email: email,
    password: hashedPassword
  });
  try {
    await newUser.save();
    return res.redirect("/");
  } catch (error) {
    return res.render("signup", { message: 'Error registering user: ' + error.message });
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const existingUser = await User.findOne({ email });
  if (!existingUser) {
    return res.render("login", { message: "User doesn't exist. Please try to sign up." });
  }
  const isMatch = await bcrypt.compare(password, existingUser.password);
  if (!isMatch) {
    return res.render("login", { message: 'Password is incorrect. Please try again.' });
  }

  const token = jwt.sign({ id: existingUser._id, name: existingUser.name }, JWT_SECRET, { expiresIn: "1h" });
  res.cookie("User", token, { httpOnly: true });
  return res.redirect("/dashboard");
});
app.get("/dashboard", authenticateUser, async (req, res) => {
  const username = req.user.name;
  const roomCookie = req.cookies.Room;
  if (!roomCookie) {
    return res.render("dashboard", {
      roomId: null,
      users: [],
      startTime: null,
      username,
      endTime: "No Active Call",
    });
  }

  let parsedRoomCookie;
  try {
    parsedRoomCookie = JSON.parse(roomCookie);
  } catch (error) {
    console.log("Error parsing Room cookie:", error);
    return res.status(400).send("Invalid Room cookie format.");
  }

  const { roomId } = parsedRoomCookie;

  try {
    const userCallHistory = await CallHistory.findOne({ roomId });

    if (userCallHistory) {
      const { users, startTime, endTime } = userCallHistory;
      res.render("dashboard", {
        roomId,
        users,
        startTime,
        username,
        endTime: endTime || "In Progress",
      });
    } else {
      res.render("dashboard", {
        roomId: null,
        users: [],
        startTime: null,
        username,
        endTime: "No Active Call",
      });
    }
  } catch (error) {
    console.log("Error fetching user call history for roomId:", roomId, error);
    res.status(500).send("Error fetching call history");
  }
});


app.get("/logout", (req, res) => {
  res.clearCookie("User");
  res.clearCookie("Room");
  res.redirect("/");
});

app.get("/join-room", authenticateUser, async (req, res) => {
  const roomId = req.query.roomId;
  const username = req.user.name;
  const userId = req.user.id;

  let roomCookie = req.cookies.Room;
  let roomData;

  if (roomCookie) {
    try {
      roomData = JSON.parse(roomCookie);
    } catch (err) {
      return res.status(400).send("Invalid Room cookie format.");
    }
  } else {
    roomData = { roomId, users: [] };
  }

  if (!roomData.users.includes(userId)) {
    roomData.users.push(userId);
  }

  res.cookie("Room", JSON.stringify(roomData), { httpOnly: true });

  try {
    let existingRoom = await CallHistory.findOne({ roomId });

    if (existingRoom) {
      existingRoom.users.push({ userId, username });
      await existingRoom.save();
    } else {
      const newCallHistory = new CallHistory({
        roomId,
        users: [{ userId, username }],
        startTime: new Date(),
      });
      await newCallHistory.save();
    }

    res.redirect(`/room/${roomId}`);
  } catch (err) {
    console.log("Error joining room: ", err);
    res.status(500).send("Error joining room");
  }
});

app.get("/room/:roomId", authenticateUser, (req, res) => {
  const roomId = req.params.roomId;
  const username = req.user.name;
  res.render("room", { roomId, username });
});

app.post("/join-call", authenticateUser, async (req, res) => {
  const roomId = uuidv4();
  const startTime = new Date();
  const userId = req.user.id;
  const username = req.user.name;

  let roomCookie = req.cookies.Room;
  let roomData;

  if (roomCookie) {
    try {
      roomData = JSON.parse(roomCookie);
      if (roomData.roomId===roomId){
        roomData.users.push(userId);
      }
      else{
        roomData={roomId,users:[userId]};
      }
    } catch (err) {
      return res.status(400).send("Invalid Room cookie format.");
    }
  } else {
    roomData = { roomId, users: [] };
  }

  roomData.users.push(userId);

  res.cookie("Room", JSON.stringify(roomData), { httpOnly: true });

  const newCallHistory = new CallHistory({
    roomId,
    users: [{ userId, username }],
    startTime,
  });

  try {
    await newCallHistory.save();
    console.log("Call history saved");

    res.redirect(`/room/${roomId}`);
  } catch (err) {
    console.log("Error saving call history: ", err);
    res.status(500).send("Error saving call history");
  }
});


app.post("/join-room", authenticateUser, async (req, res) => {
  const { roomId } = req.body;
  const username = req.user.name;
  const userId = req.user.id;

  let roomCookie = req.cookies.Room;
  let roomData;

  if (roomCookie) {
    try {
      roomData = JSON.parse(roomCookie);
      if (roomData.roomId===roomId){
        roomData.users.push(userId);
      }
      else{
        roomData={roomId,users:[userId]};
      }

    } catch (err) {
      return res.status(400).send("Invalid Room cookie format.");
    }
  } else {
    roomData = { roomId, users: [] };
  }

  res.cookie("Room", JSON.stringify(roomData), { httpOnly: true });

  try {
    const updatedRoom = await CallHistory.findOneAndUpdate(
      { roomId },
      { $push: { users: { userId, username } } },
      { new: true }
    );

    if (!updatedRoom) {
      return res.status(404).send("Room not found");
    }
    console.log(`User ${username} joined room ${roomId}`);
    res.redirect(`/room/${roomId}`);
  } catch (err) {
    console.log("Error updating room with new user: ", err);
    res.status(500).send("Error joining room");
  }
});
app.get("/end_meet", authenticateUser, async (req, res) => {
  const roomCookie = req.cookies.Room;
  console.log("Room cookie:", roomCookie); 

  if (!roomCookie) {
    return res.status(400).send("Room cookie is missing.");
  }

  let parsedRoomCookie;
  try {
    parsedRoomCookie = JSON.parse(roomCookie);
  } catch (error) {
    console.error("Invalid Room cookie format:", error);
    return res.status(400).send("Invalid Room cookie format.");
  }

  const { roomId } = parsedRoomCookie;
  const userId = req.user.id; 
  console.log("Room ID:", roomId, "User ID:", userId);

  const endTime = new Date();

  try {
    const room = await CallHistory.findOne({ roomId });
    if (!room) {
      console.error("Room not found for ID:", roomId);
      return res.status(404).send("Room not found.");
    }

    console.log("Room found:", room);

    room.users = room.users.filter(user => user.userId !== userId);
    console.log("Room users after removal:", room.users);
    const roomData = { roomId, users: room.users };

    if (room.users.length === 0) {
      room.endTime = endTime;
      console.log(`Room ${roomId} ended at ${endTime}`);
      io.to(roomId).emit("room-ended", { roomId });
    }

    await room.save();
    console.log("Room saved successfully.");
    // res.clearCookie("Room");
    res.cookie("Room", JSON.stringify(roomData), { httpOnly: true });
    return res.redirect("/dashboard");
  } catch (err) {
    console.error("Error ending room:", err);
    return res.status(500).send("Internal Server Error");
  }
});

app.get("/room_details", authenticateUser, async (req, res) => {
  try {
    const callHistory = await CallHistory.find({ endTime: { $ne: null } });
    res.render("history", { callHistory });
  } catch (error) {
    console.log("Error fetching call history: ", error);
    res.status(500).send("Error fetching call history");
  }
});

io.on("connection", (socket) => {
  socket.on("join-room", (roomId, userId, userName) => {
    socket.join(roomId);
    setTimeout(() => {
      socket.to(roomId).broadcast.emit("user-connected", userId);
    }, 1000);

    socket.on("message", (message) => {
      io.to(roomId).emit("createMessage", message, userName);
    });
  });
});

server.listen(process.env.PORT || 3030, () => {
  console.log("Server is running on port 3030");
});
