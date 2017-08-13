const fs = require('fs');
const path = require('path');

const fetch = require('node-fetch');
const cheerio = require('cheerio');

const storagePath = path.resolve(`${__dirname}/../storage`)
const templateHTMLPath = path.resolve(`${__dirname}/../template.html`);
const prettyHTMLPath = path.resolve(`${__dirname}/../HackerNews.html`);

const HNLink = 'https://news.ycombinator.com/';
const newsPerPage = 30;

let defaultOptions = {
  json: true,
  count: 30,
  saveFormat: 'all', // json, html, all
  scrapeDelay: 1000 * 60 * 60, // 1 Hour
  scrapeComment: false,
  fetchDelay: 500,
  duplicateKey: 'link'
}

const HNArchive = (options) => {
  // Extends options
  options = Object.assign(defaultOptions, options);

  this.scrapeDelay = options.scrapeDelay;
  this.nextScrapeTimeout = null;

  /**
   * Fetches HackerNews pages and retrieve source html
   * @method _fetch
   * @return Promise
   */
  this._fetch = () => {
    return new Promise((resolve, reject) => {
      let numPages = Math.ceil(options.count / newsPerPage),
        urls = [],
        promises = [];

      // Generate urls to request for
      for (let i = 1; i < numPages + 1; i++) {
        let url = `${HNLink}/news?p=${i}`;
        urls.push(url);
      }

      const createReqPromise = (url) => {
        return new Promise((accept, fail) => {
          fetch(url).then(response => response.text()).then((page) => {
            accept(page);
          }).catch(err => {
            console.log('Error :', err);
            fail(err);
          });
        });
      }

      if (urls.length > 0) {
        // Create an interval that sends request for each url
        // Return when all requests are completed
        let reqInterval = setInterval(() => {
          if (urls.length === 0) {
            Promise.all(promises).then((pages) => {
              console.log('All pages are retrieved');
              resolve(this._process(pages));
            }).catch(err => {
              reject(err);
            });
            clearInterval(reqInterval);
          } else {
            promises.push(createReqPromise(urls.shift()));
          }
        }, options.fetchDelay);
      }
    });
  };

  /**
   * Iterate through retrieved html pages and extract news object
   * @method _process Synchronous
   * @param Array
   * @return Array
   */
  this._process = (pages) => {
    if (pages.length === 0) {
      return;
    }
    let data = [];

    // Loop over pages and extract news
    pages.forEach((page) => {
      let $ = cheerio.load(page);
      let itemList = $('body').find('.itemlist'),
        listBody = $(itemList).children('tbody');

      $(listBody).find('tr').each((i, itemElem) => {
        if ($(itemElem).hasClass('athing')) {

          let id = parseInt($(itemElem).attr('id'));
          let newsAnchor = $(itemElem).find('.storylink');
          let rank = $(itemElem).find('.rank').text();
          let title = $(newsAnchor).text();
          let link = $(newsAnchor).attr('href');

          let subtext = $(itemElem).next();
          let score = $(subtext).find('.score').text();
          let comment = $(subtext).find('a').last().text();

          link = link.startsWith('item?id')
            ? HNLink + link
            : link;
          comment = comment.includes('comment')
            ? comment
            : null;

          let news = {
            rank,
            title,
            link,
            score,
            comment,
            id
          }
          data.push(news);
        }
      });
    });

    return data;
  };

  /**
   * Merge JSON for same day news
   * @method _merge
   * @param (String, Array)
   * @return Promise
   */
  this._merge = (filePath, currentDataJSON) => {

    return this._readFile(filePath).then((dataString) => {
      let prevJSON = JSON.parse(dataString);
      // Merge Step
      let newsMap = {},
        merged = [],
        rankStart = 1;

      let duplicateKey = options.duplicateKey;

      currentDataJSON.forEach((data, index) => {
        newsMap[data[duplicateKey]] = data;
      });

      // Updates score only if the news is duplicate
      prevJSON.forEach((prevData, index) => {
        let duplicateCheck = prevData[duplicateKey];
        if (!(duplicateCheck in newsMap)) {
          newsMap[duplicateCheck] = prevData
        }
        /* console.log(` Skipping [ Title: ${prevData.title} : ${duplicateCheck} ] `);*/
      });

      //Rearragne rank
      for (let key in newsMap) {
        let news = newsMap[key];
        news.rank = rankStart;
        rankStart++;
        merged.push(news);
      }

      console.log('Merged length', merged.length);
      return this._saveData(filePath, merged);
    });
  }

  /**
   * Saves data as specified in the option
   * @method _saveData
   * @param (String, Array)
   * @return Promise
   */
  this._saveData = (filePath, data) => {
    return new Promise((resolve, reject) => {
      const successCallback = (successWrite) => {
        if (successWrite) {
          resolve(data);
          return;
        }
        reject('Failed to write');
      }

      this._writeFile(filePath, JSON.stringify(data)).then((writeSuccess) => {
        if (options.saveFormat === 'json') {
          successCallback(writeSuccess);
        } else {
          this._generateHTML(data).then(successCallback);
        }
      });
    });
  }

  /**
   * Merge or save data
   * @method _save
   * @param Array
   * @return Promise { Array }
   */
  this._save = (data) => {
    const saveFilePath = this._getSaveFilePath();
    return this._createFolder(saveFilePath).then((storeDir) => {
      let fileName = `${this.getTodayString()}.json`,
        filePath = path.join(storeDir, fileName);

      console.log('File save path ', filePath);

      if (fs.existsSync(filePath)) {
        return this._merge(filePath, data);
      } else {
        return this._saveData(filePath, data);
      }
    });
  }

  /**
   * Generates human-friendly HTML
   * @method _generateHTML
   * @param Array
   * @return Promise { boolean }
   */
  this._generateHTML = (dataJSON) => {
    console.log('GenerateHTML');

    return this._readFile(templateHTMLPath).then((html) => {
      let $ = cheerio.load(html);

      dataJSON.forEach((data) => {
        let {rank, title, link} = data;
        let itemHTML = `<dt><label>${rank} </label><a href=${link}>${title}</a></dt>`
        $(itemHTML).appendTo($('.itemlist'));
      });
      return this._writeFile(prettyHTMLPath, $.html());
    });
  }

  /**
   * Creates a folder with given name if it does not exist already
   * @method _createFolder
   * @param String
   * @return Promise { String }
   */
  this._createFolder = (folder) => {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(folder)) {
        fs.mkdir(folder, (err) => {
          console.log('Creating folder', folder);
          if (err) {
            reject(err);
            return;
          }
          resolve(folder);
        });
      } else {
        resolve(folder);
      }
    });
  }

  // Read file from given path and resolves data
  this._readFile = (filePath) => {
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, (err, data) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(data);
      });
    });
  }

  // Returns promise that resolves after writing the given data
  this._writeFile = (filePath, data) => {
    return new Promise((resolve, reject) => {
      fs.writeFile(filePath, data, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(true);
      });
    });
  }

  this._getSaveFilePath = (date = null) => {
    date = !date
      ? new Date()
      : date;
    const year = new Date(date).getUTCFullYear(),
      filePath = path.join(storagePath, `${String(year)}`);
    return filePath;
  }

  // TODO: Should use UTC Time ?
  // Returns today's YYYY-MM-DD format string
  this.getTodayString = () => {
    let date = new Date(),
      year = date.getUTCFullYear(),
      month = date.getMonth() < 9
        ? '0' + String(date.getMonth() + 1)
        : date.getMonth() + 1,
      day = date.getDate() < 10
        ? '0' + String(date.getDate())
        : date.getDate(),
      today = `${year}-${month}-${day}`
    return today;
  }

  // Read JSON file of the given date
  // TODO: There's a bug in this code
  this.getJSON = (date) => {
    const filePath = this._getSaveFilePath();

    return new Promise((resolve, reject) => {
      this._readFile(path.join(filePath, `${date}.json`)).then((data) => {
        resolve(JSON.parse(data));
      }).catch(err => {
        reject(err);
      });
    });
  }

  // Return dir items
  this.getStoredItems = (path = this._getSaveFilePath()) => {
    return fs.readdirSync(path);
  };

  // Fetch, save, and resolve data
  this.scrape = () => {
    return new Promise((resolve, reject) => {
      this._fetch().then((pages) => {
        return this._save(pages);
      }).then((data) => {
        resolve(data);
      });
    });
  }

  // Starts interval for scraping
  this.start = (callback, intervalDelay = this.scrapeDelay) => {
    if (this.nextScrapeTimeout) {
      console.log('Clearing previous timeout...');
      clearTimeout(this.nextScrapeTimeout);
    }

    //Scrape first
    this.scrape().then((data) => {
      console.log('Inital Scrape Done');
      callback(data);
    });

    console.log(`IntervalDelay = ${intervalDelay}`);

    const nextOffsetInMillisecToHour = (intervalDelayInMillisec) => {
      let date = new Date(),
        currentOffsetInMillisec = (date.getMinutes() * 60 + date.getSeconds()) * 1000;
      if (intervalDelayInMillisec < currentOffsetInMillisec) {
        return intervalDelayInMillisec;
      }
      return intervalDelayInMillisec - currentOffsetInMillisec;
    }

    this.nextScrapeTimeout = null;

    // Create scrape timeout that creates next scrape timeout
    const createNextScrapeTimeout = () => {

      let delayInMillisec = nextOffsetInMillisecToHour(intervalDelay),
        current = new Date().getTime();

      console.log(`Next Scrape in ${new Date(current + delayInMillisec).toString()}, millisecond left = ${delayInMillisec}`);

      this.nextScrapeTimeout = setTimeout(() => {
        this.scrape().then((data) => {
          console.log(new Date().toString(), ' Scraper Kicking in...  ');
          callback(data);

          // Create next scrape timeout
          createNextScrapeTimeout();

        });
      }, delayInMillisec);
    }

    createNextScrapeTimeout();

    // TODO: Create scrape timeout that kicks in at 00:00:00 AM ?
    /* let now = new Date(),
       hour = now.getHours(),
       min = now.getMinutes(),
       sec = now.getSeconds();

     * let midnight = 86400;
     * let nowInSec = hour * 3600 + min * 60 + sec;
     * let offsetInMillisec = (midnight - nowInSec) * 1000;
     * console.log(`${hour} : ${min} : ${sec} => ${nowInSec}, diff = ${offsetInMillisec}`);


     * let midnightDate = new Date((new Date().getTime() + diff) * 1000);
     * console.log(midnightDate.toString());
     */
  }

  return this;
};

module.exports = HNArchive;
