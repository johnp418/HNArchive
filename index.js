if (process.argv.length < 2) {
  module.exports = (options) => {
    return require('./lib/index')(options);
  }
} else {
  const exported = require('./lib/index')();
  exported.scrape();
}

