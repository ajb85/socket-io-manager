const { Users } = require("models/");
const { ACTIVE_SOCKET_MODELS } = require("Constants.js");

class Chainable {
  constructor(manager) {
    this.manager = manager;
    this.userIds = {};
  }

  _buildDataCommands() {
    ACTIVE_SOCKET_MODELS.forEach((key) => {
      this[this._camelCase(key)] = (...data) => {
        const payload = this._method !== "added" ? arrayToLookup(data) : data;
        const actionType = this._method + this._capitalCase(key);
        if (key === "Rooms" && this._method === "deleted") {
          this.manager.clearChatRoom(...data);
        }
        this._assignPropsToThis("payload", payload);
        this._assignPropsToThis("action", actionType);
        return this;
      };
    });
  }

  _camelCase(str) {
    // Not really camel case, just lower cases the first letter
    return str[0].toLowerCase() + str.substring(1);
  }

  _capitalCase(str) {
    return str[0].toUpperCase() + str.substring(1);
  }

  _assignPropsToThis(nestUnderKey, data) {
    if (!this[nestUnderKey]) {
      this[nestUnderKey] = {};
    }

    if (this._isObject(data)) {
      this[nestUnderKey] = { ...this[nestUnderKey], ...data };
    } else {
      this[nestUnderKey] = data;
    }
  }

  _userIdToAuthId(userId) {
    if (this.userIds[userId]) {
      return Promise.resolve(this.userIds[userId]);
    }

    return Users.find({ id: userId })
      .select("authId")
      .first()
      .then(({ authId }) => {
        console.log("FOUND USER: ", authId);
        this.userIds[userId] = authId;
        return authId;
      });
  }

  _isObject(obj) {
    return obj !== null && typeof obj === "object" && !Array.isArray(obj);
  }
}

exports.ChainEmit = class ChainEmit extends Chainable {
  constructor(manager, method) {
    super(manager);
    this._method = method;
    this._buildDataCommands();
  }

  for(destinationObj) {
    this._assignPropsToThis("destination", destinationObj);
    return this.manager._sendEmit(this);
  }

  forChatRooms(...chatRooms) {
    const rooms = chatRooms.map((cr) => {
      const r = cr.hasOwnProperty("id")
        ? cr.id
        : cr.hasOwnProperty("roomId")
        ? cr.roomId
        : cr;

      return "chat_" + r;
    });

    return this.for({ rooms });
  }

  forCompany(companyId = this.payload.companyId) {
    return this.for({ rooms: ["company_" + companyId] });
  }

  forCompanies(...companyIds) {
    return this.for({ rooms: companyIds.map((id) => "company_" + id) });
  }

  forUserOverCompany(userId) {
    return Users.findById(userId).then(([{ authId, companyId }]) =>
      this.for({ user: { authId, room: "company_" + companyId } })
    );
  }
};

exports.ChainSubscribe = class ChainSubscribe extends Chainable {
  constructor(manager, authId) {
    super(manager);
    this._assignPropsToThis("authId", authId);
  }

  to(destinationObj) {
    this._assignPropsToThis("destination", destinationObj);
    return this.manager._subscribe(this);
  }

  toRooms(...rooms) {
    if (Array.isArray(rooms[0]) && rooms.length === 1) {
      rooms = rooms[0];
    }

    return this.to({ rooms });
  }
};

function arrayToLookup(data) {
  return data.reduce((acc, d) => {
    if (d) {
      const id = typeof d === "string" || typeof d === "number" ? d : d.id;
      acc[id] = d;
    }
    return acc;
  }, {});
}
