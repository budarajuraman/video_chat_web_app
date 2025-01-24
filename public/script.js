const socket = io("/");
const videoGrid = document.getElementById("video-grid");
const myVideo = document.createElement("video");
const showChat = document.querySelector("#showChat");
const backBtn = document.querySelector(".header__back");
myVideo.muted = true;

backBtn.addEventListener("click", () => {
  document.querySelector(".main__left").style.display = "flex";
  document.querySelector(".main__left").style.flex = "1";
  document.querySelector(".main__right").style.display = "none";
  document.querySelector(".header__back").style.display = "none";
});

showChat.addEventListener("click", () => {
  document.querySelector(".main__right").style.display = "flex";
  document.querySelector(".main__right").style.flex = "1";
  document.querySelector(".main__left").style.display = "none";
  document.querySelector(".header__back").style.display = "block";
});

const user = USER_NAME;

const peer = new Peer({
  host: "127.0.0.1",
  port: 3030,
  path: "/peerjs",
  debug: 3,
});

let myVideoStream;
navigator.mediaDevices
  .getUserMedia({ audio: true, video: true })
  .then((stream) => {
    myVideoStream = stream;
    addVideoStream(myVideo, stream);

    peer.on("call", (call) => {
      call.answer(stream);
      const video = document.createElement("video");
      call.on("stream", (userVideoStream) => {
        addVideoStream(video, userVideoStream);
      });
    });

    socket.on("user-connected", (userId) => {
      connectToNewUser(userId, stream);
    });
  })
  .catch((err) => console.error("Error accessing media devices:", err));

peer.on("open", (id) => {
  socket.emit("join-room", ROOM_ID, id, user);
});

const connectToNewUser = (userId, stream) => {
  const call = peer.call(userId, stream);
  const video = document.createElement("video");
  call.on("stream", (userVideoStream) => {
    addVideoStream(video, userVideoStream);
  });
};

const addVideoStream = (video, stream) => {
  video.srcObject = stream;
  video.addEventListener("loadedmetadata", () => {
    video.play();
    videoGrid.append(video);
  });
};

let text = document.querySelector("#chat_message");
let send = document.getElementById("send");
let messages = document.querySelector(".messages");

send.addEventListener("click", () => {
  if (text.value.trim().length > 0) {
    socket.emit("message", text.value);
    text.value = "";
  }
});

text.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && text.value.trim().length > 0) {
    socket.emit("message", text.value);
    text.value = "";
  }
});

const inviteButton = document.querySelector("#inviteButton");

inviteButton.addEventListener("click", () => {
  const roomId = window.location.pathname.split("/")[2]; 
  const joinUrl = `${window.location.origin}/join-room`;

  prompt(
    "Copy this link and send it to people you want to meet with:",
    `${joinUrl}?roomId=${roomId}`
  );
});


muteButton.addEventListener("click", () => {
  const enabled = myVideoStream.getAudioTracks()[0].enabled;
  myVideoStream.getAudioTracks()[0].enabled = !enabled;
  muteButton.innerHTML = enabled
    ? `<i class="fas fa-microphone-slash"></i>`
    : `<i class="fas fa-microphone"></i>`;
  muteButton.classList.toggle("background__red", !enabled);
});

stopVideo.addEventListener("click", () => {
  const enabled = myVideoStream.getVideoTracks()[0].enabled;
  myVideoStream.getVideoTracks()[0].enabled = !enabled;
  stopVideo.innerHTML = enabled
    ? `<i class="fas fa-video-slash"></i>`
    : `<i class="fas fa-video"></i>`;
  stopVideo.classList.toggle("background__red", !enabled);
});

socket.on("createMessage", (message, userName) => {
  messages.innerHTML += `<div class="message">
    <b><i class="far fa-user-circle"></i> ${
      userName === user ? "Me" : userName
    }</b>
    <span>${message}</span>
  </div>`;
});
socket.on("user-left", ({ userId }) => {
  console.log(`User with ID ${userId} left the room.`);
});

socket.on("room-ended", ({ userId }) => {
  console.log(`The room has ended. Last user ID: ${userId}`);
  document.cookie = "Room=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC";
  alert("The room has ended. Redirecting to the dashboard.");
  window.location.href = "/dashboard";
});
