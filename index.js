/* if (process.argv.length < 2) {
 *   module.exports = (options) => {
 *     return require('./lib/index')(options);
 *   }
 * } else {
 *   const exported = require('./lib/index')();
 *   exported.scrape();
 * }
 *
 * */

module.exports = (opt) => {
  /* console.log(process.argv);*/
  return require('./lib/index')(opt);
}

/* const HN = require('./lib/index')();*/
/* HN.scrape();*/
/* let date = '2017-08-06';
 *
 * HN.getJSON(date).then((data) => {
 *   console.log(data)
 * }).catch(err => {
 *   console.log('err', err);
 * })*/
