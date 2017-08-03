const fs = require('fs');
const path = require('path');

const fetch = require('node-fetch');
const cheerio = require('cheerio');

const saveFilePath = path.resolve(`./storage`)
const templateHTMLPath = path.resolve('./template.html');
const prettyHTMLPath = path.resolve('./HackerNews.html');

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
}

const HNStore = ((options) => {
  if (!options) {
    options = defaultOptions;
  }
  this.pages = [];
  this.data = [];
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
	      clearInterval(reqInterval);
	      resolve(this._process(pages));
  	    }).catch(err => {
  	      reject(err);
  	    });
  	  } else {
  	    promises.push(createReqPromise(urls.shift()));
  	  }
  	}, fetchDelay);
      }
    });
  };

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
   * @method _process
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
      for (let page of pages) {
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
  	    let news = {
  	      rank,
  	      title,
  	      link,
	      score,
  	    }
  	    data.push(news);
	  }
	});
      }
      /* console.log(`${data}`);*/
    }
    return data;
  };

  this._merge = (filePath, dataJSON) => {
    console.log('Merge');
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, (err, data) => {
	if (err) {
	  reject(err);
	  return;
	}
	resolve(JSON.parse(data));
      });
    }).then((prevJSON) => {
      // Merge Step
      let newsMap = {},
	  merged = [],
	  rankStart = 1;

      for (let i = 0; i < dataJSON.length; i++) {
	newsMap[dataJSON[i].title] = dataJSON[i];
      }

      // Updates score only if the news is duplicate
      for (let i = 0; i < prevJSON.length; i++) {
	let title = prevJSON[i].title;
	if (title in newsMap) {
	  newsMap[title].score = prevJSON[i].score;
	  continue;
	}
	newsMap[title] = prevJSON[i];
      }

      for (let key in newsMap) {
	let news = newsMap[key];
	news.rank = rankStart;
	rankStart++;
	merged.push(news);
      }

      console.log('merged length', merged.length);
      return this._generateHTML(merged).then((success) => {
	return this._saveJSON(filePath, merged);
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
	    month = date.getMonth() < 10 ? '0' + String(date.getMonth() + 1) : date.getMonth(),
	    day = date.getDate() < 10 ? '0' + String(date.getDate()) : date.getDate(),
	    today = `${year}-${month}-${day}`
	let fileName = `${today}.json`,
	    filePath = path.join(storeDir, fileName);

	console.log('file path ', filePath)
	if (fs.existsSync(filePath)) {
	  return this._merge(filePath, data);
	} else {
	  return this._generateHTML(data).then((success) => {
	    return this._saveJSON(filePath, data);
	  });
	}
      }).then(() => {
	resolve();
      }).catch(err => {
	reject(err);
      });
    });
    
  }

  this._saveJSON = (filePath, data) => {
    return new Promise((resolve, reject) => {
      fs.writeFile(filePath, JSON.stringify(data), (err) => {
	if (err) {
	  reject(err);
	  return;
	}
	resolve();
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
    return new Promise((resolve, reject) => {
      fs.readFile(templateHTMLPath, (err, html) => {
	if (err) {
	  reject(err);
	  return;
	}
	resolve(html);
      });
    }).then((html) => {
      return new Promise((resolve, reject) => {
	let $ = cheerio.load(html);

	dataJSON.forEach((data) => {
	  let {rank, title, link} = data;
	  let itemHTML = `<dt><label>${rank} </label><a href=${link}>${title}</a></dt>`
	  $(itemHTML).appendTo($('.itemlist'));
	});
	
	fs.writeFile(prettyHTMLPath, $.html(), (err) => {
	  if (err) {
	    reject(err);
	    return;
	  }
	  resolve(true);
	});
      });
    });
  }

  this._clear = () => {
    this.pages = [];
    this.data = [];
  }

  this.start = () => {
    return new Promise((resolve, reject) => {
      this._fetch()
	  .then((pages) => this._save(pages))
	  .then(() => {
	    console.log('DONE');
	    resolve();
	  });
    });
  }
  
  
  return this;
})();

module.exports = HNStore;

/* HNStore.generateHTML();*/

HNStore.start();
