"use strict";
var Completers;
setTimeout(function() {
  var HistoryCache, RankingUtils, RegexpCache, Decoder,
      Completers, queryType, offset,
      maxCharNum, maxResults, showFavIcon, showRelevancy, queryTerms, SuggestionUtils;

  function Suggestion(type, url, text, title, computeRelevancy, extraData) {
    this.type = type;
    this.url = url;
    this.text = text || url;
    this.title = title || "";
    this.relevancy = computeRelevancy(this, extraData);
  }

SuggestionUtils = {
  PrepareHtml: function(sug) {
    showRelevancy || (delete sug.relevancy);
    if (sug.textSplit) { return; }
    var _this = SuggestionUtils;
    sug.titleSplit = _this.highlight(sug.title, _this.getRanges(sug.title));
    var str = sug.text = _this.shortenUrl(sug.text);
    sug.textSplit = _this.cutUrl(str, _this.getRanges(str), sug.url);
    if (showFavIcon && sug.url.indexOf("://") > 0) {
      sug.favIconUrl = Utils.escapeCssUri(sug.url);
    }
  },
  highlight: function(string, ranges) {
    var _i, out, start, end, end2;
    if (ranges.length === 0) { return Utils.escapeText(string); }
    out = [];
    for(_i = 0, end = 0; _i < ranges.length; _i += 2) {
      start = ranges[_i];
      end2 = ranges[_i + 1];
      out.push(Utils.escapeText(string.substring(end, start)), '<span class="OSTitle">',
        Utils.escapeText(string.substring(start, end2)), "</span>");
      end = end2;
    }
    out.push(Utils.escapeText(string.substring(end)));
    return out.join("");
  },
  shortenUrl: function(url) {
    return url.substring((url.startsWith("http://")) ? 7 : (url.startsWith("https://")) ? 8 : 0,
      url.length - +(url.charCodeAt(url.length - 1) === 47 && !url.endsWith("://")));
  },
  pushMatchingRanges: function(string, term, ranges) {
    var index = 0, textPosition = 0, matchedEnd,
      splits = string.split(RegexpCache.get(term, "(", ")")),
      _ref = splits.length - 2;
    for (; index <= _ref; index += 2) {
      matchedEnd = (textPosition += splits[index].length) + splits[index + 1].length;
      ranges.push([textPosition, matchedEnd]);
      textPosition = matchedEnd;
    }
  },
  getRanges: function(string) {
    var ranges = [], _i, _len, _ref = queryTerms;
    for (_i = 0, _len = _ref.length; _i < _len; ++_i) {
      this.pushMatchingRanges(string, _ref[_i], ranges);
    }
    if (ranges.length === 0) { return ranges; }
    ranges.sort(this.rsortBy0);
    return this.mergeRanges(ranges);
  },
  rsortBy0: function(a, b) { return b[0] - a[0]; },
  mergeRanges: function(ranges) {
    var mergedRanges = ranges.pop(), i = 1, range, ind = ranges.length;
    while (0 <= --ind) {
      range = ranges[ind];
      if (mergedRanges[i] >= range[0]) {
        if (mergedRanges[i] < range[1]) {
          mergedRanges[i] = range[1];
        }
      } else {
        mergedRanges.push(range[0], range[1]);
        i += 2;
      }
    }
    return mergedRanges;
  },
  cutUrl: function(string, ranges, strCoded) {
    var out = [], cutStart = -1, temp, lenCut, i, end, start;
    if (string.length <= maxCharNum || (cutStart = strCoded.indexOf(":")) < 0) {}
    else if (string.substring(cutStart, cutStart + 3) !== "://") { ++cutStart; }
    else if ((cutStart = strCoded.indexOf("/", cutStart + 4)) >= 0) {
      temp = string.indexOf("://");
      cutStart = string.indexOf("/", (temp < 0 || temp > cutStart) ? 0 : (temp + 4));
    }
    cutStart = (cutStart < 0) ? string.length : (cutStart + 1);
    for(i = 0, lenCut = 0, end = 0; i < ranges.length; i += 2) {
      start = ranges[i];
      temp = (end >= cutStart) ? end : cutStart;
      if (temp + 20 > start) {
        out.push(Utils.escapeText(string.substring(end, start)));
      } else {
        out.push(Utils.escapeText(string.substring(end, temp + 10)), "...",
          Utils.escapeText(string.substring(start - 6, start)));
        lenCut += start - temp - 19;
      }
      end = ranges[i + 1];
      out.push('<span class="OSUrl">', Utils.escapeText(string.substring(start, end)), "</span>");
    }
    temp = maxCharNum + lenCut;
    if (string.length <= temp) {
      out.push(Utils.escapeText(string.substring(end)));
    } else {
      out.push(Utils.escapeText(string.substring(end,
        (temp - 3 > end) ? (temp - 3) : (end + 10))), "...");
    }
    return out.join("");
  }
};

Completers = {
bookmarks: {
  bookmarks: null,
  currentSearch: null,
  path: "",
  filter: function(query) {
    if (this.bookmarks) {
      this.performSearch(query);
      return;
    }
    if (queryTerms.length === 0) {
      Completers.next([]);
    } else {
      this.currentSearch = query;
    }
    if (this.refresh) {
      chrome.bookmarks.getTree(this.refresh.bind(this));
      this.refresh = null;
    }
  },
  StartsWithSlash: function(str) { return str.charCodeAt(0) === 47; },
  performSearch: function(query) {
    var c, results, name;
    if (queryTerms.length === 0) {
      results = [];
    } else {
      name = queryTerms.some(this.StartsWithSlash) ? "path" : "title";
      c = this.computeRelevancy;
      results = this.bookmarks.filter(function(i) {
        return RankingUtils.Match2(i.text, i[name]);
      }).map(function(i) {
        return new Suggestion("bookm", i.url, i.text, i[name], c);
      });
      if (offset > 0 && queryType === 1) {
        results.sort(Completers.rsortByRelevancy);
        results = results.slice(offset, offset + maxResults);
      }
    }
    Completers.next(results);
  },
  refresh: function(tree) {
    var bookmarks = chrome.bookmarks, listener, _this = this;
    listener = function() {
      bookmarks.getTree(function(tree) { _this.readTree(tree); });
    };
    bookmarks.onCreated.addListener(listener);
    bookmarks.onRemoved.addListener(listener);
    bookmarks.onChanged.addListener(listener);
    bookmarks.onMoved.addListener(listener);
    bookmarks.onImportBegan.addListener(function() {
      bookmarks.onCreated.removeListener(listener);
    });
    bookmarks.onImportEnded.addListener(function() {
      bookmarks.getTree(function(tree) {
        bookmarks.onCreated.addListener(listener);
        _this.readTree(tree);
      });
    });
    this.traverseBookmark = this.traverseBookmark.bind(this);
    _this.readTree(tree);
    var query = _this.currentSearch;
    _this.currentSearch = null;
    if (query && !query.isOff) {
      _this.performSearch(query);
    }
  },
  readTree: function(bookmarks) {
    this.bookmarks = [];
    bookmarks.forEach(this.traverseBookmark);
    Decoder.decodeList(this.bookmarks);
  },
  ignoreTopLevel: {
    "Bookmarks Bar": 1,
    "Mobile Bookmarks": 1,
    "Other Bookmarks": 1,
    "\u4E66\u7B7E\u680F": 1,
    "\u5176\u4ED6\u4E66\u7B7E": 1
  },
  traverseBookmark: function(bookmark) {
    var path = this.path;
    bookmark.path = !bookmark.title ? "" : path ? (path + '/' + bookmark.title)
      : (bookmark.title in this.ignoreTopLevel) ? "" : ('/' + bookmark.title);
    if (bookmark.children) {
      this.path = bookmark.path;
      bookmark.children.forEach(this.traverseBookmark);
      this.path = path;
    } else {
      this.bookmarks.push(bookmark);
    }
  },
  computeRelevancy: function(suggestion) {
    return RankingUtils.wordRelevancy(suggestion.text, suggestion.title);
  }
},

history: {
  filter: function(query) {
    var _this = this, history = HistoryCache.history;
    if (queryType === 1) { queryType = 3; }
    if (queryTerms.length > 0) {
      if (history) {
        Completers.next(this.quickSearch(history));
      } else {
        HistoryCache.use(function(history) {
          if (query.isOff) { return; }
          Completers.next(Completers.history.quickSearch(history));
        });
      }
      return;
    }
    chrome.sessions ? chrome.sessions.getRecentlyClosed(null, function(sessions) {
      if (query.isOff) { return; }
      var historys = [], arr = {}, i, now = Date.now();
      i = queryType === 3 ? -offset : 0;
      sessions.some(function(item) {
        var entry = item.tab;
        if (!entry || entry.url in arr) { return; }
        arr[entry.url] = 1;
        ++i > 0 && historys.push(entry);
        return historys.length >= maxResults;
      }) ? _this.filterFinish(historys, query) :
      _this.filterFill(historys, query, arr, -i);
    }) : this.filterFill(null, query, {}, 0);
    if (! history) {
      setTimeout(function() {
        HistoryCache.use(function() {});
      }, 50);
    }
  },
  quickSearch: function(history) {
    var maxNum = (maxResults + (queryType === 3 ? offset : 0)) * 2,
    results = new Array(maxNum), sug,
    query = queryTerms, regexps = [], len = history.length, i, len2, j, s1,
    score, item, getRele = this.computeRelevancy;
    for (j = maxNum; 0 <= (j -= 2); ) {
      results[j] = 0.0;
    }
    maxNum -= 2;
    // inline version of RankingUtils.Match2
    for (j = len2 = queryTerms.length; 0 <= --j; ) {
      regexps.push(RegexpCache.get(query[j], "", ""));
    }
    for (i = 0; i < len; ++i) {
      item = history[i];
      for (j = 0; j < len2; ++j) {
        if (!(regexps[j].test(item.text) || regexps[j].test(item.title))) { break; }
      }
      if (j !== len2) { continue; }
      score = getRele(item.text, item.title, item.lastVisitTime);
      if (results[maxNum] >= score) { continue; }
      j = maxNum - 2;
      if (results[j] >= score) {
        results[maxNum] = score;
        results[maxNum + 1] = item;
        continue;
      }
      results.length = maxNum;
      for (; 0 <= (j -= 2); ) {
        if (results[j] >= score) { break; }
      }
      if (j >= 0) {
        results.splice(j + 2, 0, score, item);
      } else {
        results.unshift(score, item);
      }
    }
    getRele = this.getRelevancy0;
    for (i = queryType === 3 ? offset * 2 : 0, j = 0; i <= maxNum; i += 2) {
      score = results[i];
      if (score <= 0) { break; }
      item = results[i + 1];
      sug = results[j++] = new Suggestion("history", item.url, item.text, item.title, getRele);
      sug.relevancy = score;
    }
    results.length = j;
    return results;
  },
  filterFill: function(historys, query, arr, cut) {
    var _this = this;
    chrome.history.search({
      text: "",
      maxResults: (Math.max(0, cut) + maxResults) * 3
    }, function(historys2) {
      if (query.isOff) { return; }
      var a = arr;
      historys2 = historys2.filter(function(i) {
        return !(i.url in a);
      });
      historys2.length = Math.min(historys2.length, Math.max(cut, 0) + maxResults);
      historys = cut < 0 ? historys.concat(historys2)
        : cut == 0 ? historys2 : historys2.slice(cut);
      _this.filterFinish(historys, query);
    });
  },
  filterFinish: function(historys, query) {
    var s = Suggestion, c = this.getRelevancy0, d = Decoder.decodeURL;
    if (historys.length > maxResults) {
      historys.length = maxResults;
    }
    historys.forEach(function(e, i, arr) {
      var o = new s("history", e.url, d(e.url), e.title, c, e.lastVisitTime);
      o.relevancy = 0.99 - i / 100;
      e.sessionId && (o.sessionId = e.sessionId);
      arr[i] = o;
    });
    Completers.next(historys);
    Decoder.continueToWork();
  },
  rsortByLvt: function(a, b) {
    return b.lastVisitTime - a.lastVisitTime;
  },
  getRelevancy0: function() { return 0; },
  computeRelevancy: function(text, title, lastVisitTime) {
    var recencyScore = RankingUtils.recencyScore(lastVisitTime),
      wordRelevancy = RankingUtils.wordRelevancy(text, title);
    return recencyScore <= wordRelevancy ? wordRelevancy : (wordRelevancy + recencyScore) / 2;
  }
},

domains: {
  domains: null,
  filter: function(query) {
    if (queryTerms.length !== 1 || queryTerms[0].indexOf("/") !== -1) {
      Completers.next([]);
    } else if (this.domains) {
      this.performSearch(query);
    } else {
      var _this = this;
      HistoryCache.use(function(history) {
        _this.populateDomains(history);
        if (query.isOff) { return; }
        _this.performSearch(query);
      });
    }
  },
  performSearch: function(query) {
    var ref = this.domains, domain, q = queryTerms, word = q[0]
      , sug, wordRelevancy, score, result = "", result_score = -1000;
    queryTerms = [word];
    for (domain in ref) {
      if (domain.indexOf(word) === -1) { continue; }
      score = RankingUtils.recencyScore(ref[domain][0]);
      wordRelevancy = RankingUtils.wordRelevancy(domain, null);
      score = score <= wordRelevancy ? wordRelevancy : (wordRelevancy + score) / 2;
      if (score > result_score) { result_score = score; result = domain; }
    }
    if (result) {
      sug = new Suggestion("domain", (ref[result][2]
          ? "https://" + result : result), result, null, this.computeRelevancy);
      sug.titleSplit = "";
      sug.textSplit = SuggestionUtils.cutUrl(result, SuggestionUtils.getRanges(result), sug.url);
    }
    queryTerms = q;
    Completers.next(sug ? [sug] : []);
  },
  populateDomains: function(history) {
    var callback = this.onPageVisited.bind(this);
    this.domains = Object.create(null);
    history.forEach(callback);
    chrome.history.onVisited.addListener(callback);
    chrome.history.onVisitRemoved.addListener(this.OnVisitRemoved);
  },
  onPageVisited: function(newPage) {
    var item, slot, time;
    if (item = this.parseDomainAndScheme(newPage.url)) {
      time = newPage.lastVisitTime;
      if (slot = this.domains[item[0]]) {
        if (slot[0] < time) { slot[0] = time; }
        ++slot[1]; slot[2] = item[1];
      } else {
        this.domains[item[0]] = [time, 1, item[1]];
      }
    }
  },
  OnVisitRemoved: function(toRemove) {
    var _this = Completers.domains;
    if (toRemove.allHistory) {
      _this.domains = {};
      return;
    }
    var domains = _this.domains, parse = _this.parseDomainAndScheme,
    arr = toRemove.urls, j = arr.length, item, entry;
    while (0 <= --j) {
      item = parse(arr[j]);
      if (item && (entry = domains[item[0]]) && (-- entry[1]) <= 0) {
        delete domains[item[0]];
      }
    };
  },
  parseDomainAndScheme: function(url) {
    var d, i;
    if (url.startsWith("http://")) { d = 7; }
    else if (url.startsWith("https://")) { d = 8; }
    else { return null; }
    i = url.indexOf('/', d);
    return [url.substring(d, i > 0 ? i : undefined), d - 7];
  },
  computeRelevancy: function() {
    return 2;
  }
},

tabs: {
  filter: function(query) {
    chrome.tabs.query({}, this.filter1.bind(this, query));
  },
  filter1: function(query, tabs) {
    if (query.isOff) { return; }
    if (queryType === 1) { queryType = 4; }
    var curTabId = TabRecency.last(), c, suggestions;
    if (queryTerms.length > 0) {
      tabs = tabs.filter(function(tab) {
        var text = Decoder.decodeURL(tab.url);
        if (RankingUtils.Match2(text, tab.title)) {
          tab.text = text;
          return true;
        }
        return false;
      });
      c = this.computeRelevancy;
    } else {
      c = this.computeRecency;
    }
    suggestions = tabs.map(function(tab) {
      var tabId = tab.id, suggestion = new Suggestion("tab",
            tab.url, tab.text, tab.title, c, tabId);
      suggestion.sessionId = tabId;
      if (curTabId === tabId) { suggestion.relevancy = 0; }
      return suggestion;
    });
    if (offset > 0 && queryType === 4 && offset < suggestions.length) {
      suggestions.sort(Completers.rsortByRelevancy);
      if (suggestions.length > maxResults) {
        suggestions = suggestions.slice(offset, offset + maxResults);
      } else {
        suggestions = suggestions.slice(offset).concat(suggestions.slice(0, offset));
      }
    }
    Completers.next(suggestions);
    Decoder.continueToWork();
  },
  computeRecency: function(_0, tabId) {
    return TabRecency.tabs[tabId] || (1 - 1 / tabId);
  },
  computeRelevancy: function(suggestion) {
    return RankingUtils.wordRelevancy(suggestion.text, suggestion.title);
  }
},

searchEngines: {
  preFilter: function(query, failIfNull) {
    var obj, sug, q = queryTerms, keyword, pattern, promise;
    if (q.length === 0) {}
    else if (failIfNull !== true && (keyword = q[0])[0] === "\\") {
      q[0] = keyword.substring(1);
      keyword = q.join(" ");
      sug = this.makeUrlSuggestion(keyword, "\\" + keyword);
      Completers.next([sug]);
      return;
    } else {
      pattern = Settings.cache.searchEngineMap[keyword];
    }
    if (!pattern) {
      if (failIfNull !== true) {
        Completers.next([]);
      }
      return true;
    }
    if (failIfNull !== true) {
      if (queryType !== 0) {
        q.push(queryTerms.more);
      }
      q.length > 1 && (queryType = 2);
    }
    if (q.length > 1) {
      q.shift();
    } else {
      q = [];
    }

    obj = Utils.createSearch(q, pattern, []);
    sug = new Suggestion("search", obj.url, ""
      , pattern.name + ": " + q.join(" "), this.computeRelevancy);
    if (keyword === "~") {}
    else if (obj.url.startsWith("vimium://")) {
      keyword = Utils.evalVimiumUrl(obj.url.substring(9), 1);
      if (keyword instanceof Promise) {
        promise = keyword;
      } else if (keyword instanceof Array) {
        switch (keyword[1]) {
        case "search":
          queryTerms = keyword[0];
          if (this.preFilter(query, true) !== true) {
            return;
          }
          break;
        }
      }
    } else {
      sug.url = Utils.convertToUrl(obj.url, null, -1);
    }

    if (q.length > 0) {
      sug.text = this.makeText(obj.url, obj.indexes);
      sug.textSplit = SuggestionUtils.highlight(sug.text, obj.indexes);
      sug.titleSplit = SuggestionUtils.highlight(sug.title
        , [pattern.name.length + 2, sug.title.length]);
    } else {
      sug.text = Utils.DecodeURLPart(SuggestionUtils.shortenUrl(obj.url));
      sug.textSplit = Utils.escapeText(sug.text);
      sug.titleSplit = Utils.escapeText(sug.title);
    }

    promise ? promise.then(function(arr) {
      if (query.isOff) { return; }
      if (!arr[0]) {
        Completers.next([sug]);
        return;
      }
      var output = [sug];
      sug = new Suggestion("math", "", "", "", Completers.searchEngines.computeRelevancy);
      output.push(sug);
      --sug.relevancy;
      sug.text = sug.title = arr[0];
      if (!arr[0].startsWith("vimium://copy")) {
        sug.url = "vimium://copy " + arr[0];
      }
      sug.titleSplit = "<span class=\"OSTitle\" style=\"text-decoration: none;\">" +
        Utils.escapeText(sug.title) + "<span>";
      sug.textSplit = Utils.escapeText(arr[2]);
      Completers.next(output);
    }) : Completers.next([sug]);
  },
  makeText: function(url, arr) {
    var len = arr.length, i, str, ind;
    ind = arr[0];
    str = Utils.DecodeURLPart(url.substring(0, ind));
    if (i = (str.startsWith("http://")) ? 7 : (str.startsWith("https://")) ? 8 : 0) {
      str = str.substring(i);
      i = 0;
    }
    arr[0] = str.length;
    while (len > ++i) {
      str += Utils.DecodeURLPart(url.substring(ind, arr[i]));
      ind = arr[i];
      arr[i] = str.length;
    }
    if (ind < url.length) {
      url = Utils.DecodeURLPart(url.substring(ind));
      if (url.charCodeAt(url.length - 1) === 47 && !url.endsWith("://")) {
        url = url.substring(0, url.length - 1);
      }
      str += url;
    }
    return str;
  },
  makeUrlSuggestion: function(keyword, text) {
    var sug = new Suggestion("search", Utils.convertToUrl(keyword, null, -1),
      "", keyword, this.computeRelevancy);
    sug.text = Utils.DecodeURLPart(SuggestionUtils.shortenUrl(sug.url));
    sug.textSplit = Utils.escapeText(sug.text);
    text && (sug.text = text);
    if (Utils.lastUrlType === 2) {
      sug.title = "~: " + keyword;
      sug.titleSplit = SuggestionUtils.highlight(sug.title, [3, 3 + keyword.length]);
    } else {
      sug.titleSplit = Utils.escapeText(keyword);
    }
    return sug;
  },
  computeRelevancy: function() {
    return 9;
  }
},

  counter: 0,
  mostRecentQuery: null,
  callback: null,
  filter: function(completers) {
    RegexpCache.clear();
    RankingUtils.timeAgo = Date.now() - RankingUtils.timeCalibrator;
    if (this.mostRecentQuery) { this.mostRecentQuery.isOff = true; }
    var query = this.mostRecentQuery = {
      isOff: false
    }, i, l;
    this.suggestions = [];
    this.counter = l = completers.length;
    this.getOffset();
    if (completers[0].preFilter) {
      completers[0].preFilter(query);
      i = 1;
    } else {
      i = 0;
    }
    for (; i < l; i++) {
      completers[i].filter(query);
    }
  },
  next: function(newSugs) {
    var suggestions, func;
    suggestions = this.suggestions.length === 0 ? newSugs
      : newSugs.length > 0 ? this.suggestions.concat(newSugs) : this.suggestions;
    if (0 < --this.counter) {
      this.suggestions = suggestions;
      return;
    }

    this.suggestions = newSugs = null;
    suggestions.sort(this.rsortByRelevancy);
    if (suggestions.length > maxResults) {
      suggestions.length = maxResults;
    }
    if (queryTerms.length > 0) {
      queryTerms[0] = SuggestionUtils.shortenUrl(queryTerms[0]);
    }
    suggestions.forEach(SuggestionUtils.PrepareHtml);
    queryTerms = null;
    func = this.callback || g_requestHandlers.PostCompletions;
    this.mostRecentQuery = this.callback = null;
    func(suggestions);
  },
  getOffset: function() {
    var str, i;
    offset = queryType = 0;
    if ((i = queryTerms.length) === 0 || (str = queryTerms[i - 1])[0] !== "+") {
      return;
    }
    if ((i = parseInt(str, 10)) >= 0 && '+' + i === str
        && i <= (queryTerms.length > 1 ? 50 : 99)) {
      offset = i;
    } else if (str !== "+") {
      return;
    }
    queryTerms.more = queryTerms.pop();
    queryType = 1;
  },
  MultiCompleter: function(completers) { this.completers = completers; },
  rsortByRelevancy: function(a, b) { return b.relevancy - a.relevancy; }
};

  Completers.MultiCompleter.prototype.filter = function(query, options, callback) {
    queryTerms = query ? query.split(Utils.spacesRe) : [];
    maxCharNum = options.clientWidth > 0 ? Math.min((
        (options.clientWidth * 0.8 - 70) / 7.72) | 0, 200) : 100
    maxResults = Math.min(Math.max(options.maxResults | 0, 3), 25);
    showFavIcon = options.showFavIcon === true;
    showRelevancy = options.showRelevancy === true;
    Completers.callback = callback;
    Completers.filter(this.completers);
  };

  RankingUtils = {
    Match2: function(s1, s2) {
      var i = queryTerms.length, cache = RegexpCache, regexp;
      while (0 <= --i) {
        regexp = cache.get(queryTerms[i], "", "");
        if (!(regexp.test(s1) || regexp.test(s2))) { return false; }
      }
      return true;
    },
    anywhere: 1,
    startOfWord: 1,
    wholeWord: 1,
    maximumScore: 3,
    recCalibrator: 2.0 / 3.0,
    _reduceLength: function(p, c) {
      return p - c.length;
    },
    scoreTerm: function(term, string) {
      var count, nonMatching, score;
      score = 0;
      count = 0;
      nonMatching = string.split(RegexpCache.get(term, "", ""));
      if (nonMatching.length > 1) {
        score = this.anywhere;
        count = nonMatching.reduce(this._reduceLength, string.length);
        if (RegexpCache.get(term, "\\b", "").test(string)) {
          score += this.startOfWord;
          if (RegexpCache.get(term, "\\b", "\\b").test(string)) {
            score += this.wholeWord;
          }
        }
      }
      return [score, count < string.length ? count : string.length];
    },
    wordRelevancy: function(url, title) {
      var c, maximumPossibleScore, s, term, titleCount, titleScore
        , urlCount, urlScore, _i = queryTerms.length, _ref;
      urlScore = titleScore = 0.0;
      urlCount = titleCount = 0;
      while (0 <= --_i) {
        term = queryTerms[_i];
        _ref = this.scoreTerm(term, url); s = _ref[0]; c = _ref[1];
        urlScore += s; urlCount += c;
        if (title) {
          _ref = this.scoreTerm(term, title); s = _ref[0]; c = _ref[1];
          titleScore += s; titleCount += c;
        }
      }
      maximumPossibleScore = this.maximumScore * queryTerms.length + 0.01;
      urlScore = urlScore / maximumPossibleScore
          * this.normalizeDifference(urlCount, url.length);
      if (!title) {
        return urlScore;
      }
      titleScore = titleScore / maximumPossibleScore
          * this.normalizeDifference(titleCount, title.length);
      return (urlScore < titleScore) ? titleScore : ((urlScore + titleScore) / 2);
    },
    timeCalibrator: 604800000, // 7 days
    timeAgo: 0,
    recencyScore: function(lastAccessedTime) {
      var score = Math.max(0, lastAccessedTime - this.timeAgo) / this.timeCalibrator;
      return score * score * score * this.recCalibrator;
    },
    normalizeDifference: function(a, b) {
      var max = Math.max(a, b);
      return (max - Math.abs(a - b)) / max;
    }
  };

  RegexpCache = {
    _cache: null,
    clear: function() {
      this._cache = Object.create(null);
    },
    escapeRe: Utils.escapeAllRe,
    get: function(s, p, n) {
      var r = p + s.replace(this.escapeRe, "\\$&") + n, v;
      return (v = this._cache)[r] || (v[r] = new RegExp(r, Utils.upperRe.test(s) ? "" : "i"));
    }
  };

  HistoryCache = {
    size: 20000,
    history: null,
    callbacks: [],
    use: function(callback) {
      if (this.history) {
        callback(this.history);
      } else {
        this.fetchHistory(callback);
      }
    },
    fetchHistory: function(callback) {
      this.callbacks.push(callback);
      if (this.callbacks.length > 1) {
        return;
      }
      var _this = this;
      chrome.history.search({
        text: "",
        maxResults: this.size,
        startTime: 0
      }, function(history) {
        Decoder.decodeList(history);
        _this.history = history;
        chrome.history.onVisited.addListener(_this.onPageVisited.bind(_this));
        chrome.history.onVisitRemoved.addListener(_this.OnVisitRemoved);
        for (var i = 0, len = _this.callbacks.length, callback; i < len; ++i) {
          callback = _this.callbacks[i];
          callback(_this.history);
        }
        _this.callbacks = [];
        setTimeout(function() {
          HistoryCache.history.sort(function(a, b) { return a.url.localeCompare(b.url); });
          setTimeout(HistoryCache.Clean, 2000);
        }, 600);
      });
    },
    Clean: function() {
      var arr = HistoryCache.history, i = arr.length, j;
      while (0 <= --i) {
        j = arr[i];
        arr[i] = {
          lastVisitTime: j.lastVisitTime,
          text: j.text,
          title: j.title,
          url: j.url
        };
      }
      if (Decoder.todos.length > 0) {
        setTimeout(function() {
          Decoder.decodeList(arr);
        }, 1000);
      }
    },
    onPageVisited: function(newPage) {
      var i = this.binarySearch(newPage.url, this.history), j;
      if (i >= 0) {
        j = this.history[i];
        j.lastVisitTime = newPage.lastVisitTime;
        j.title = newPage.title || j.title;
        return;
      }
      j = {
        lastVisitTime: newPage.lastVisitTime,
        text: Decoder.decodeURL(newPage.url),
        title: newPage.title,
        url: newPage.url
      };
      this.history.splice(-1 - i, 0, j);
      Decoder.continueToWork();
    },
    OnVisitRemoved: function(toRemove) {
      var _this = HistoryCache;
      if (toRemove.allHistory) {
        _this.history = null;
        return;
      }
      var bs = _this.binarySearch, h = _this.history, arr = toRemove.urls, j, i;
      for (j = arr.length; 0 <= --j; ) {
        i = bs(arr[j], h);
        if (i >= 0) {
          h.splice(i, 1);
        }
      }
    },
    binarySearch: function(u, a) {
      var e, h = a.length - 1, l = 0, m = 0;
      while (l <= h) {
        m = Math.floor((l + h) / 2);
        e = a[m].url.localeCompare(u);
        if (e > 0) { h = m - 1; }
        else if (e < 0) { l = m + 1; }
        else { return m; }
      }
      e = a[m].url;
      if (e < u) { return -2 - m; }
      return -1 - m;
    }
  };

  Decoder = {
    _f: decodeURIComponent, // core function
    decodeURL: null,
    decodeList: function(a) {
      var i = -1, j, l = a.length, d = Decoder, f = d._f, s, t, m = d.dict, w = d.todos;
      for (; ; ) {
        try {
          while (++i < l) {
            j = a[i];
            t = f(s = j.url);
            j.text = t !== s ? t : s;
          }
          break;
        } catch (e) {
          j.text = m[s] || (w.push(j), s);
        }
      }
      d.continueToWork();
    },
    dict: Object.create(null),
    todos: [], // each item is either {url: ...} or "url"
    _timer: 0,
    working: -1,
    interval: 18,
    continueToWork: function() {
      if (this._timer === 0 && this.todos.length > 0) {
        this._timer = setInterval(this.Work, this.interval);
      }
    },
    Work: function() {
      var _this = Decoder, url, str, text;
      if (_this.working === -1) {
        _this.init();
        _this.working = 0;
      }
      if (! _this.todos.length) {
        clearInterval(_this._timer);
        _this._timer = 0;
        _this._link.href = "";
      } else if (_this.working === 0) {
        while (url = _this.todos[0]) {
          str = url.url || url;
          if (text = _this.dict[str]) {
            url.url && (url.text = text);
            _this.todos.shift();
          } else {
            _this.working = 1;
            _this._link.href = _this._dataUrl + str + "%22%7D";
            break;
          }
        }
      } else if (_this.working === 1) {
        text = window.getComputedStyle(_this._div).fontFamily;
        text = text.substring(1, text.length - 1);
        url = _this.todos.shift();
        if (str = url.url) {
          _this.dict[str] = url.text = text;
        } else {
          _this.dict[url] = text;
        }
        _this.working = 0;
        _this.Work();
      }
    },
    _dataUrl: "",
    _id: "_decode",
    _link: null,
    _div: null,
    setDataUrl: function(charset) {
      this._dataUrl = "data:text/css;charset=" + charset + ",%23" + this._id +
          "%7Bfont-family%3A%22";
    },
    init: function() {
      var link = this._link = document.createElement('link'),
          div = this._div = document.createElement('div');
      link.rel = 'stylesheet';
      div.id = this._id;
      div.style.display = 'none';
      document.head.appendChild(link);
      document.body.appendChild(div);
      this._dataUrl || this.setDataUrl("GBK");
    }
  };

  setTimeout(function() {
    (function() {
      var d = Decoder.dict, f = Decoder._f, t = Decoder.todos;
      Decoder.decodeURL = function(a) {
        try {
          return f(a);
        } catch (e) {
          return d[a] || (t.push(a), a);
        }
      };
    })();

    var lang;
    if (lang = Settings.get("UILanguage")) {
      var ref = lang.urlCode;
      if (ref && typeof ref === "string") {
        Decoder.setDataUrl(ref);
      }
      ref = lang.bookmarkTypes;
      if (ref && ref.length > 0) {
        var i = ref.length, ref2 = Completers.bookmarks.ignoreTopLevel;
        ref.sort().reverse();
        for (; 0 <= --i; ) {
          ref2[ref[i]] = 1;
        }
      }
    }

    setTimeout(function() {
      queryTerms || HistoryCache.history || HistoryCache.use(function(history) {
        queryTerms || setTimeout(function() {
          var domainsCompleter = Completers.domains;
          if (queryTerms || domainsCompleter.domains) { return; }
          domainsCompleter.populateDomains(history);
        }, 50);
      });
    }, 30000);
  }, 100);

  window.Completers = {
    bookmarks: new Completers.MultiCompleter([Completers.bookmarks]),
    history: new Completers.MultiCompleter([Completers.history]),
    omni: new Completers.MultiCompleter([Completers.searchEngines, Completers.domains
      , Completers.history, Completers.bookmarks]),
    tabs: new Completers.MultiCompleter([Completers.tabs])
  };

}, 200);

setTimeout(function() {
  Settings.postUpdate("searchEngines", null);
}, 300);
