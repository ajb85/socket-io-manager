module.exports = function (socket) {
  const socketRecord = this.connected[socket.id];

  if (socketRecord) {
    // Socket will be treated like a brand new socket
    // upon reconnection, so best to just delete its record.
    // The server relies upon the FE client to remember
    // the state of the socket
    if (socket.user && socket.user.authId) {
      delete this.userToSocket[socket.user.authId];
    }
    delete this.connected[socket.id];
  }
};
