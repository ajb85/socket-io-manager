module.exports = function (socket, room) {
  // Not an approved way to listen for events.
  // Should go through the /subscribe endpoint.  However,
  // this is used specifically for callbacks, which are part of
  // verifying a sockets identity.  So for the time being, this
  // will only run if the client is asking for the callbacks room.
  if (room === "callback") {
    socket.join(room);
  }
};
