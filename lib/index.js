const fs = require('fs');
const path = require('path');

const fetch = require('node-fetch');
const cheerio = require('cheerio');

const saveFilePath = path.resolve(`${__dirname}/../storage`)
const templateHTMLPath = path.resolve('${__dirname}/../template.html');
const prettyHTMLPath = path.resolve('${__dirname}/../HackerNews.html');

const HNLink = 'https://news.ycombinator.com/';
const newsPerPage = 30;
const fetchDelay = 500;
const refreshDelay = 1000 * 60 * 60; // 1 Hour

let defaultOptions = {
  json: true, 
  count: 30,
  searchBy: [],
  sortBy: '', // ['rank', 'vote', 'comments', 'time']
  storeBy: ['daily','all'], // ['date'],
  saveDir: './storage',
  saveFormat: 'all', // json, html, all
  scrapeDelay: 1000 * 60 * 60 // 1 Hour
}

const HNArchive = (options) => {
  // Extends options
  options = Object.assign(defaultOptions, options);
  this.scrapeDelay = options.scrapeDelay;
  this.pages = [];
  this.data = [];

  this.fetchInterval = null;
  
  let secret = `...secret...`;
  
  /**
   * Fetches HackerNews pages and retrieve source html
   * @method _fetch
   * @return Promise
   */
  this._fetch = () => {
    return new Promise((resolve, reject) => {
      console.log('Fetch');
      let numPages = Math.ceil( options.count / newsPerPage ),
  	  urls = [],
  	  promises = [];

      // Generate urls to request for
      for (let i = 1; i < numPages + 1; i++) {
  	let url = `${HNLink}/news?p=${i}`;
  	urls.push(url);
      }

      const createReqPromise = (url) => {
	return new Promise((accept, fail) => {
  	  fetch(url)
  	    .then(response => response.text())
  	    .then((page) => {
  	      console.log('retrieved page');
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
  	      console.log('all promises are resolved');
	      resolve(this._process(pages));
  	    }).catch(err => {
  	      reject(err);
  	    });
	    clearInterval(reqInterval);
  	  } else {
  	    promises.push(createReqPromise(urls.shift()));
  	  }
  	}, fetchDelay);
      }
    });
  };

  // TODO: Filter in server? 
  this._filter = (pages) => {
    let searchKeywords = options.searchBy;
    let newsCounter = 0;
    for (let page of pages) {
      let $ = cheerio.load(page);
      let itemList = $('body').find('.itemlist').find('.athing');
      
    }
  }

  /**
   * Iterate through retrieved html pages and extract news object
   * @method _process Synchronous
   * @param null
   * @return null
   */
  this._process = (pages) => {
    let data = [];
    if (pages.length === 0) {
      return;
    }
    console.log('Process');
    if (options.searchBy && options.searchBy.length > 0) {
      pages = this._filter(pages);
    } else {
      
      // Loop over pages and extract news 
      pages.forEach((page) => {
	let $ = cheerio.load(page);
	let itemList = $('body').find('.itemlist'),
	    listBody = $(itemList).children('tbody');

	$(listBody).find('tr').each((i, itemElem) => {
	  if ($(itemElem).hasClass('athing')) {
	    let subtext = $(itemElem).next();
	    let newsAnchor = $(itemElem).find('.storylink');
  	    let rank = $(itemElem).find('.rank').text();
  	    let title = $(newsAnchor).text();
  	    let link = $(newsAnchor).attr('href');
	    let score = $(subtext).find('.score').text();
	    if (link.startsWith('item?id')) {
	      link = HNLink + link;
	    }
  	    let news = { rank, title, link, score, }
  	    data.push(news);
	  }
	});
      });
      /* console.log(`${data}`);*/
    }
    return data;
  };

  this._merge = (filePath, currentDataJSON) => {
    console.log('Merge');

    return this._readFile(filePath).then((dataString) => {
      let prevJSON = JSON.parse(dataString);
      // Merge Step
      let newsMap = {},
	  merged = [],
	  rankStart = 1;

      currentDataJSON.forEach((data, index) => {
	newsMap[data.title] = data;
      });

      // Updates score only if the news is duplicate
      prevJSON.forEach((prevData, index) => {
	let title = prevData.title;
	if (title in newsMap) {
	  newsMap[title].score = prevData.score;
	} else {
	  newsMap[title] = prevData;
	}
      });
      
      for (let key in newsMap) {
	let news = newsMap[key];
	news.rank = rankStart;
	rankStart++;
	merged.push(news);
      }
      
      console.log('merged length', merged.length);
      return this._generateHTML(merged).then((success) => {
	return this._writeFile(filePath, JSON.stringify(merged));
      });      
    });
  }
  

  /**
   * Saves an array of news object as json
   * @method _save
   * @param null
   * @return Promise { Object } 
   */
  this._save = (data) => {
    console.log(' Save as JSON (Default)');
    return new Promise((resolve, reject) => {
      if (!data) {
	reject('No data is given');
	return;
      }
      // TODO: Customizable file name ?

      return this._createFolder(saveFilePath).then((storeDir) => {
	let date = new Date(),
	    year = date.getFullYear(),
	    month = date.getMonth() < 9 ? '0' + String(date.getMonth() + 1) : date.getMonth() + 1,
	    day = date.getDate() < 10 ? '0' + String(date.getDate()) : date.getDate(),
	    today = `${year}-${month}-${day}`
	let fileName = `${today}.json`,
	    filePath = path.join(storeDir, fileName);
	
	console.log('file path ', filePath)
	if (fs.existsSync(filePath)) {
	  return this._merge(filePath, data);
	} else {
	  return this._generateHTML(data).then((success) => {
	    return this._writeFile(filePath, JSON.stringify(data));
	  });
	}
      }).then((successWrite) => {
	if (successWrite) {
	  resolve();
	  return;
	}
	reject('Failed to write');
      }).catch(err => {
	reject(err);
      });
    });
    
  }


  /**
   * Creates a folder with given name if it does not exist already
   * @method _save
   * @param String 
   * @return Promise { String } 
   */
  this._createFolder = (folder) => {
    console.log('folder', folder);
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(folder)) {
	fs.mkdir(folder, (err) => {
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

  /**
   * 
   * @method _save
   * @param String 
   * @return Promise { String } 
   */
  this._generateHTML = (dataJSON) => {
    console.log('generateHTML');

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

  this._clear = () => {
    this.pages = [];
    this.data = [];
    clearInterval(this.fetchInterval);
  }

  this.scrape = () => {
    return new Promise((resolve, reject) => {

      this._fetch().then((pages) => {
	if (options.saveFormat === 'json') {
	  let date = new Date(),
	      year = date.getFullYear(),
	      month = date.getMonth() < 9 ? '0' + String(date.getMonth() + 1) : date.getMonth() + 1,
	      day = date.getDate() < 10 ? '0' + String(date.getDate()) : date.getDate(),
	      today = `${year}-${month}-${day}`
	  let fileName = `${today}.json`,
	      filePath = path.join(storeDir, fileName);
	  this._writeFile(filePath, JSON.stringify(pages)).then(() => {
	    console.log('ONLY JSON');
	    resolve();
	  });  
	} else {
	  this._save(pages).then(() => {
	    console.log('DONE');
	    resolve();
	  });
	}
      });
      
    });
  }

  this.start = () => {
    if (this.fetchInterval) {
      console.log('There is already an interval');
    }
    // Starts interval for fetching
    this.fetchInterval = setInterval(() => {
      this.scrape();
    }, this.scrapeDelay);
  }

  this.stop = () => {
    this.clear();
  }

  this.getJSON = (date) => {
    return new Promise((resolve, reject) => {
      this._readFile(path.join(saveFilePath, `${date}.json`))
	  .then((data) => {
	    resolve(JSON.parse(data));
	  }).catch(err => {
	    reject(err);
	  });
    });
  }

  this.getStoredItems = (path = saveFilePath) => {
    return fs.readdirSync(path);
  };
  
  return this;
};

module.exports = HNArchive;

/* HNArchive.generateHTML();*/

/* HNArchive().scrape();*/
