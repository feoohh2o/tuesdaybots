function log(text) {
  Logger.log(text);
}

function sendLog() {
  var recipient = Session.getActiveUser().getEmail();
  var subject = 'discussion thread log';
  var body = Logger.getLog();
  MailApp.sendEmail(recipient, subject, body);
}


function authenticate(credentials) {
  var authData = UrlFetchApp.fetch('https://ssl.reddit.com/api/v1/access_token', {
    payload: {
      grant_type: 'password',
      scope: 'wikiread,submit,modposts,read',
      username: credentials.username,
      password: credentials.password
    },
    method: 'post',
    headers: {'Authorization': 'Basic ' + Utilities.base64Encode(credentials.client_id + ':' + credentials.client_secret)}
  })
  authData = JSON.parse(authData)
  return authData;
}

function fetchRedditData(reddit, options) {
  var headers = {};
  var fetch_options = {
    headers: headers
  };
  var url = options.url;
  if (options.queryString) {
    url = url + options.queryString;
  }
  url = 'https://oauth.reddit.com' + url;
  headers.Authorization = 'bearer ' + reddit['access_token'];
  if (options.method === 'post') {
    fetch_options.payload = options.payload;
    fetch_options.method = "post";
  }
  log("Making request to url: " + url + " with options " +  JSON.stringify(fetch_options));
  var templateData = UrlFetchApp.fetch(url, fetch_options);
  log("response from url " + url + ":" + templateData);
  return JSON.parse(templateData);

}
function getWikiPage(reddit, subreddit, page) {
  var templateData = fetchRedditData(reddit, {url: '/r/' + subreddit + '/wiki/' + page});
  return templateData['data']['content_md'];
}

function getPreviousDiscussionThread(reddit, subreddit, author) {
  var templateData = fetchRedditData(reddit, {
    url: '/r/' + subreddit + '/hot',
    queryString: '?limit=2'
  });
  var children = templateData['data']['children'];
  for (var i = 0; i < children.length; i++) {
    var child = children[i];
    if (child.data.author == author) {
      return child;
    }
  }
}

function getTitle(title_format) {
  var now = new Date();
  var month = now.getMonth();
  var day = now.getDate();
  var year = now.getFullYear();
  var all_months_text = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var month_text = all_months_text[month];
  var date_format = month_text + " " + day + ", " + year;
  return title_format.replace("{date}", date_format);
}


function submitSelfPost(reddit, subreddit, title, body) {
  var submitResult = fetchRedditData(reddit, {
    url: '/api/submit',
    method: 'post',
    payload: {
      sr: subreddit,
      title: title,
      text: body,
      kind: "self"
    }
  });
  var url = submitResult.jquery
    .map(function (x) { return x[3][0]})
    .filter(function (x) {
      return x && x.indexOf && x.indexOf('http') !== -1;
    })[0];
  var id = url.split("/")[6];
  return {
    kind: 't3',
    data: {
      url: url,
      id: id
    }
  };
}


function getFullName(post) {
  return post.kind + '_' + post.data.id;
}

function distinguish(reddit, post) {
  var submitResult = fetchRedditData(reddit, {
    url: '/api/distinguish',
    method: 'post',
    payload: {
      how: "yes",
      id: getFullName(post)
    }
  });
}


function setSuggestedSort(reddit, post, type) {
  fetchRedditData(reddit, {
    url: '/api/set_suggested_sort',
    method: 'post',
    payload: {
      sort: type,
      id: getFullName(post)
    }
  });
}

function stickyPost(reddit, post, num) {
  fetchRedditData(reddit, {
    url: '/api/set_subreddit_sticky',
    method: 'post',
    payload: {
      state: true,
      num: num,
      id: getFullName(post)
    }
  });
}


function unstickyPost(reddit, post) {
  fetchRedditData(reddit, {
    url: '/api/set_subreddit_sticky',
    method: 'post',
    payload: {
      state: false,
      id: getFullName(post)
    }
  });
}

function getOtherStickiedPost(reddit, subreddit) {
  var templateData = fetchRedditData(reddit, {
    url: '/r/' + subreddit + '/hot',
    queryString: '?limit=1'
  });
  var children = templateData['data']['children'];
  var child = children[0];
  if (child.data.stickied) {
    return child;
  }
}

function _main() {
  var config = CONFIG;
  var reddit = authenticate(config.credentials);
  body = getWikiPage(reddit, config.subreddit, "discussion_thread");
  log("discussion_thread body from wiki page: " +  body);
  var previous = getPreviousDiscussionThread(reddit, config.subreddit, config.credentials.username);
  if (previous) {
    log("found previous dt: " + JSON.stringify(previous));
    body = body + "\n\n[Previous Discussion Thread](" + previous.data.url + ")";
    log("new body: " + body);
    unstickyPost(reddit, previous);
  }
  var title = getTitle(config.title);
  log("title: " + title);
  var post = submitSelfPost(reddit, config.subreddit, title, body);
  log("new post: " + JSON.stringify(post));
  distinguish(reddit, post);
  setSuggestedSort(reddit, post, "new");
  stickied = getOtherStickiedPost(reddit, config.subreddit);
  if (stickied) {
      unstickyPost(reddit, stickied);
  }
  stickyPost(reddit, post, 1);
  if (stickied) {
    stickyPost(reddit, stickied, 2);
  }
}

function main() {
  try {
    _main();
  } catch (err) {
    log("error: " + JSON.stringify(err));
    sendLog();
    throw err;
  }
  sendLog();
}

function deleteTriggers() {
  logTriggers();
  var triggers = ScriptApp.getProjectTriggers();
  for (var i=0; i<triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
  logTriggers();
}


function logTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  log("num triggers: " + triggers.length);
  for (var i=0; i<triggers.length; i++) {
    var trigger = triggers[i];
    log("trigger at " + trigger.getEventType() + " , handler: " + trigger.getHandlerFunction());
  }
}

function run() {

   deleteTriggers();

  ScriptApp.newTrigger("main")
           .timeBased()
           .everyWeeks(1)
           .onWeekDay(ScriptApp.WeekDay.MONDAY)
           .atHour(5)
           .create();
  ScriptApp.newTrigger("main")
           .timeBased()
           .onWeekDay(ScriptApp.WeekDay.THURSDAY)
           .atHour(5)
           .create();
  logTriggers();
}
