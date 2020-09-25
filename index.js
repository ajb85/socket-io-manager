const http = require("server/http.js");
const socketIO = require("socket.io");
const reqDir = require("require-dir");
const listeners = reqDir("./listeners/");
const ResponseTracker = require("./ResponseTracker.js");
const { ChainEmit, ChainSubscribe } = require("./Chains.js");

// Feature toggle
const socketsAreEnabled =
  process.env.ENABLE_SOCKETS &&
  process.env.ENABLE_SOCKETS.toLowerCase() !== "n" &&
  process.env.ENABLE_SOCKETS.toLowerCase() !== "false";

class SocketsManager {
  constructor(disable) {
    if (!disable) {
      this.io = socketIO(http);
      this.connected = {};
      this.userToSocket = {};

      this.responseTracker = new ResponseTracker();

      console.log("\nSocket manager online!\n");

      this.io.on("connection", (socket) => {
        this.connected[socket.id] = socket;
        socket.subscriptions = {};

        for (let l in listeners) {
          const listener = listeners[l];
          socket.on(l, listener.bind(this, socket));
        }
      });
    }
  }

  add() {
    return new ChainEmit(this, "added");
  }

  update() {
    return new ChainEmit(this, "updated");
  }

  delete() {
    return new ChainEmit(this, "deleted");
  }

  subscribe(authId) {
    return new ChainSubscribe(this, authId);
  }

  clearChatRoom(roomId) {
    const room = "chat_" + roomId;
    const users = this.getSocketsList(room) || [];
    users.forEach(({ user: { authId } }) => {
      if (authId) {
        const socket = this._getSocketFromAuth(authId);
        if (socket) {
          socket.leave(room);
        }
      }
    });
  }

  getSocketsList(room) {
    return Object.values(this.io.of("/").in(room).clients().connected);
  }

  isConnected(socket_id) {
    return this.connected.hasOwnProperty(socket_id);
  }

  _sendEmit({ action, payload, destination }) {
    const actionType =
      "sockets" + action[0].toUpperCase() + action.substring(1);
    const { rooms, user } = destination;
    if (rooms) {
      return this._emitToRooms(rooms, actionType, payload);
    } else if (user) {
      const { room, authId } = user;
      return this._emitToUsers([authId], room, actionType, payload);
    }
  }

  _emitToRooms(rooms, ...args) {
    return Promise.all(
      rooms.map((r) => {
        const idList = this.getSocketsList(r)
          .filter(({ user }) => user && user.authId)
          .map(({ user }) => user.authId);
        return this._emitToUsers(idList, r, ...args);
      })
    );
  }

  _emitToUsers(users, room, ...args) {
    if (!Array.isArray(users)) {
      users = [users];
    }

    const emitList = users.reduce((acc, u) => {
      acc[u] = false;
      return acc;
    }, {});

    const pCallback = (res) =>
      setTimeout(() => {
        res({ sentTo: emitList });
      }, process.env.SOCKET_EMIT_TIMEOUT || 1000);

    const responseCallback = (authId) => (emitList[authId] = true);
    users.forEach((authId) => {
      const socket = this.userToSocket[authId];

      if (socket) {
        const code = this.responseTracker.record(
          responseCallback.bind(this, authId)
        );
        socket.emit(room, code, ...args);
      }
    });
    return promise(pCallback);
  }

  _subscribe({ authId, destination }) {
    const { rooms } = destination;
    const results = { joined: [], denied: [] };

    let reasons;
    if (rooms) {
      const socket = this.userToSocket[authId];
      if (socket) {
        rooms.forEach((room) => {
          // Need to do a check here or at the endpoint
          // to verify the user is allowed to join the room
          // but there are currently no rules for rooms.
          const alreadyJoined = socket.subscriptions[room];
          const forbidden = false;

          if (forbidden) {
            // Can never trigger, just a placeholder
            return results.denied.push({
              room,
              status: false,
              reason: "Forbidden",
            });
          }
          if (!alreadyJoined) {
            socket.join(room);
            socket.subscriptions[room] = true;
          }
          return results.joined.push({ room, status: true });
        });
      } else reasons = "Socket disconnected or is not identified.";
    } else reasons = "No room provided";
    return results.joined.length || results.denied.length
      ? results
      : { failed: true, reasons };
  }

  _getSocketFromAuth(authId) {
    return this.userToSocket[authId];
  }

  _isObject(obj) {
    return obj !== null && typeof obj === "object" && !Array.isArray(obj);
  }
}

class NoSockets {
  constructor() {
    console.log("Sockets are offline.");
    Object.getOwnPropertyNames(
      Object.getPrototypeOf(new Socket("disable"))
    ).forEach((key) => {
      if (key !== "constructor") {
        this[key] = () => this;
      }
    });
  }
}

module.exports = socketsAreEnabled ? new SocketsManager() : new NoSockets();

function promise(callback) {
  return new Promise((resolve) => {
    return callback(resolve);
  });
}
