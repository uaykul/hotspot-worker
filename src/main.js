

const main = async () => {
    // #####! WARNING - WILL BE REMOVED IN PRODUCTION CODE BY KSG-INSTALL !#####
    // eslint-disable-next-line global-require
    const path = require("path");
    if (path.dirname(process.execPath) !== process.cwd()) {
      return;
    }};

    module.exports = {
        main,
    }