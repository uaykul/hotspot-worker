const { iptModule } = require("../modules");
const logger = require("../config/logger");
const ApiError = require("../utils/ApiError");

const service = "ipt";
global.socket.on(service, (msg) => {
  const { txid, ...data } = msg;
  global.socket.emit("processing");
  iptModule
    .run(data)
    .then((result) => {
      global.socket.emit("processed", { txid, service, result });
      logger.info("%O", { service, data, result });
    })
    .catch((error) => {
      const message = error instanceof ApiError ? error.message : "error.otherError";
      global.socket.emit("processed", { txid, service, error: message });
      logger.info("%O", { service, data, error });
    });
});
