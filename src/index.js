/* eslint-disable global-require */
const io = require("socket.io-client");
const config = require("./config/config");
const logger = require("./config/logger");
const { main } = require("./main");

process.on("uncaughtException", unexpectedErrorHandler);
process.on("unhandledRejection", unexpectedErrorHandler);
process.on("SIGTERM", () => {
  logger.info("SIGTERM received");
  exitHandler(0);
});

main()
  .then(async (result) => {
    global.socket = io(config.socketUrl, {
      query: {
        device: true,
      },
    });
    if (result) {
      setInterval(() => {
        if (global.socket.connected) {
          global.socket.emit("pulse");
        }
      }, 1000);
    } else {
      initialized();
      restarted();
      logger.info("Service started");
    }
  })
  .catch(() => {
    exitHandler(2);
  });

function initialized() {
  global.socket.on("workeronline", () => {
    global.socket.emit("workeronline");
  });
}

function restarted() {
  (function publish() {
    if (global.socket.connected) {
      global.socket.emit("restarted");
    } else {
      setTimeout(publish, 1000);
    }
  })();
}

function exitHandler(code) {
  process.exit(code);
}

function unexpectedErrorHandler(error) {
  logger.error(error);
  exitHandler(1);
}
