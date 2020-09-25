const Users = require("models/users-model");
const db = require("config/dbConfig");
const { getDecodedJwt } = require("middleware/checkJwt.js");

const emitBadCall = (socket, code) =>
  socket.emit("callback", { code, status: false });

module.exports = function (socket, { code, token }) {
  const { userToSocket } = this;
  try {
    getDecodedJwt(token)
      .then(async (u) => {
        await db.transaction(async (trx) => {
          const user = await Users.findByAuthId(u.sub).transacting(trx).first();
          if (user) {
            socket.user = user;
            socket.user.fullName = user.firstName + " " + user.lastName;
            userToSocket[user.authId] = socket;
            socket.emit("callback", { code, status: true });
          } else {
            console.log("USER NOT FOUND");
            emitBadCall(socket, code);
          }
        });
      })
      .catch((err) => {
        console.log("ERROR IDENTIFYING: ", err);
        emitBadCall(socket, code);
      });
  } catch (err) {
    emitBadCall(socket, code);
  }
};
