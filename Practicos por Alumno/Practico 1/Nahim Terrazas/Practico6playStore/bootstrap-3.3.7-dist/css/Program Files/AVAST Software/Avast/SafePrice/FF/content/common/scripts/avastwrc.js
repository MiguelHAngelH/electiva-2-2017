var { setTimeout, setInterval, clearTimeout } = require('sdk/timers');

/**
 *
 *  Avast WebRep plugin
 *  (c) 2012 Avast Corp.
 *
 *
 *
 *  Testing Phishing and SiteCorrect sites:
 *
 *  (http(s)?://)test-phishing.ff.avast.com(/)? phishing site / phishing domain
 *  (http(s)?://)test-typo.ff.avast.com(.*) sitecorrect suggestion  www.avast.com
 *  (http(s)?://)test-blocker.ff.avast.com(.*) blocker site
 *
 *
 *
 *
 *
 */

(function(_, PROTO) {

    if (typeof(AvastSP)=="undefined") { AvastSP = {};}

    var RATING_PENDING        = -1;
    var RATING_NONE           = 0;
    var RATING_GOOD           = 1;
    var RATING_AVERAGE        = 2;
    var RATING_BAD            = 3;
    var NUM_RATINGS           = 4;

    var RATING_THRESHOLD_BAD      = 33;
    var RATING_THRESHOLD_AVERAGE  = 66;
    var RATING_THRESHOLD_GOOD     = 100;

    var WEIGHT_THRESHOLD1     = 33;
    var WEIGHT_THRESHOLD2     = 66;
    var WEIGHT_THRESHOLD3     = 100;

    var WEIGHT0               = 0;
    var WEIGHT1               = 1;
    var WEIGHT2               = 2;
    var WEIGHT3               = 3;

    var WEIGHT0_TEXT = 'noWeight';
    var WEIGHT1_TEXT = 'weight1';
    var WEIGHT2_TEXT = 'weight2';
    var WEIGHT3_TEXT = 'weight3';

    var RATING0_TEXT = 'noRating';
    var RATING1_TEXT = 'ratingGood';
    var RATING2_TEXT = 'ratingAverage';
    var RATING3_TEXT = 'ratingBad';

    var ICON_STRING0 = 'icn_extensiontop.png';
    var ICON_STRING11 = 'icn_extensiontop_green.png';
    var ICON_STRING12 = 'icn_extensiontop_green.png';
    var ICON_STRING13 = 'icn_extensiontop_green.png';
    var ICON_STRING21 = 'icn_extensiontop_orange.png';
    var ICON_STRING22 = 'icn_extensiontop_orange.png';
    var ICON_STRING23 = 'icn_extensiontop_orange.png';
    var ICON_STRING31 = 'icn_extensiontop_red.png';
    var ICON_STRING32 = 'icn_extensiontop_red.png';
    var ICON_STRING33 = 'icn_extensiontop_red.png';

    var TTL_DATE_FORMAT = 'yyyymmddHHMMss';

    // event types (AvastSP.gpb.All.EventType)
    var EV_TYPE_CLICK = 0;
    var EV_TYPE_TABFOCUS = 3;

    /**
     * Throttle function to prevent flooding of our servers
     *
     * Orignal version is part of underscore.js library.
     *
     * @param  {Function} func Function to be executed by at least 'wait' miliseconds
     * @param  {Number}   wait Miliseconds to wait before executing the function
     * @return {Function}      Wrapped up original function with throttling
     */
    function throttle(func, wait) {
            var context, args, timeout, result;
            var previous = 0;
            var later = function() {
                previous = new Date;
                timeout = null;
                result = func.apply(context, args);
            };
            return function() {
                var now = new Date;
                var remaining = wait - (now - previous);
                context = this;
                args = arguments;
                if (remaining <= 0) {
                    clearTimeout(timeout);
                    timeout = null;
                    previous = now;
                    result = func.apply(context, args);
                } else if (!timeout) {
                    timeout = setTimeout(later, remaining);
                }
                return result;
            };
    }

    /*******************************************************************************
     *
     *  AvastSP Defaults
     *
     ******************************************************************************/
    _.extend(AvastSP,{
        DEFAULTS : {
            LOG : true,
            USER : null,
            // Throttling requests by given amount of miliseconds
            THROTTLE : 250,
            // default ttl used in results (if not provided by the server)
            TTL : 3600,
            // local storage names for caching
            CACHE: {
                DOMAIN : "urlinfo",
                WARNING : "warning",
                URIS : "urlinfo-details",
                RULES : "avastwrc_rules"
            },
            // list of url schemes we should not handle
            IGNORE_TABS : [
                "chrome://",
                "chrome-extension:",
                "chrome-devtools://",
                "https://chrome.google.com/webstore",
                "about:",
                "view-source:",
                "file://",
                "//localhost",
                "file://",
                "data:text/html"
            ],
            // url info bitmask
            URLINFO_MASK : {
                webrep      : 1,
                phishing    : 2,
                blocker     : 4,
                siteCorrect : 8
            },
            // webrep flags bit mask
            WEBREP_FLAGS_MASK : {
                shopping : 1,
                social : 2,
                news : 4,
                it : 8,
                corporate : 16,
                pornography : 32,
                violence : 64,
                gambling : 128,
                drugs : 256,
                illegal : 512
            },
            PROPERTIES : [
                    "WebRepControl",
                    "WebRepPhishingFilter",
                    "WebRepSafeZone",
                    "WebRepNoPopups",
                    "SiteCorrect",
                    "SiteCorrectAutoRedirect"
            ],
            DNT_MOCKS_RULES : [
                {pattern : "google-analytics\\.com\\/(ga\\.js)", mock : "ga.js"},
                {pattern : "\\/(omniture|mbox|hbx|omniunih)(.*)?\\.js", mock : "omniture.js"},
                {pattern : "adnxs\\.com", mock : "empty.js"},
                {pattern : "gpt.js$", mock : "gpt.js"},
                {pattern : "\\.googletagservices\\.com\\/tag\\/js\\/(.+)\\.js", mock : "gpt.js"}
            ]
        }
    });


/*******************************************************************************
 *
 *  AvastSP Config
 *
 ******************************************************************************/

 _.extend(AvastSP,{
    // Default properties - will/should be overwritten, once connected to avast! program
    CONFIG : {
        // should we display webrep ratings?
        ENABLE_WEBREP_CONTROL: true,        // saved
        // should we validate phishing?
        ENABLE_PHISHING_CONTROL: true,      // saved
        // are we able to use safe zone?
        ENABLE_SAFEZONE_CONTROL: false,     // not saved, it depends on availability of avast! webserver
        // show popups for multirequest icons?
        SHOW_POPUPS: true,                  // saved
        // perform sitecorrect checks?
        ENABLE_SITECORRECT: false,          // not saved, it depends on availability of avast! webserver
        // automtically redirect all sitecorrect corrections?
        ENABLE_SITECORRECT_AUTO: false,     // not saved, it depends on availability of avast! webserver
        // enable SERP functionality
        ENABLE_SERP: true,
        // enable SERP popup functionality
        ENABLE_SERP_POPUP: true,
        // enable SafePrice
        ENABLE_SAS: true,
        // Should we log all information to avast - NOT IMPLEMENTED and was never used before
        LOGGING: false,                     // not saved, it depends on availability of avast! webserver
        // Avast Plugin version - updated
        VERSION: 8,
        // GUID - obtained from avast program
        GUID: null,
        // AUID - obtained from avast program
        AUID: null,
        // HWID - hardwareId/MIDEX obtained from avast program
        HWID: null,
        // UUID - user ID - obtained from avast program
        UUID: null,
        // userId - persisting userId from cookie to use in identity calls
        USERID: null,
        // Can we connect to avast! proram on localhost?
        LOCAL_ENABLED : true,
        // Caller ID: A7R5=1 A8=2 TEST 10000
        CALLERID : 10000,
        // Extension type
        EXT_TYPE : 1,
        EXT_VER  : 0,
        DATA_VER : 0,
        EDITION  : 0
    }
});

    /*******************************************************************************
     *
     *  AvastSP Core
     *
     ******************************************************************************/

    _.extend(AvastSP, {
        // Export constants
        RATING_PENDING: RATING_PENDING,
        RATING_NONE: RATING_NONE,
        RATING_GOOD: RATING_GOOD,
        RATING_AVERAGE: RATING_AVERAGE,
        RATING_BAD: RATING_BAD,

        EXT_TYPE_AOS  : 1,
        EXT_TYPE_SP   : 2,
        EXT_TYPE_AOSP : 3,
        EXT_TYPE_ABOS : 4,

        /**
         * Start new avast core
         * @return {Object} Self reference;
         */
        init : function(callerID){

            this.bs.initPlatform(); // init browser specifics

            AvastSP.CONFIG.CALLERID = callerID;

            // we can connect to avast! on localhost only on windows - update the property
            this.CONFIG.LOCAL_ENABLED = AvastSP.Utils.getBrowserInfo().isWindows();
            // update the correct browser version
            this.CONFIG.VERSION = this.bs.getVersion();

            this.load();

            // User was logged in - refresh the user token
            if(AvastSP.USER) this.loginRefresh();
            if(this.loadLocale) this.loadLocale();
            this.bindEvents();
            return this;
        },
        /**
         * Return contents of the localStorage for a given storage name
         * @param  {String} storage Storage name
         * @return {String}         Storage contents
         */
        getStorage : function(storage){
            // THIS SHOULD BE REFACTORED - move all browser specific overrides to one place
            if (AvastSP.Utils.getBrowserInfo().isFirefox()) {
                return AvastSP.bs.getLocalStorage().getItem(storage);
            } else {
                return localStorage[storage];
            }
        },
        /**
         * Save data to local storage
         * @param {String} storage Storage name
         * @param {String} data    Storage
         */
        setStorage : function(storage, data){
            // save it to local storage
            if (AvastSP.Utils.getBrowserInfo().isFirefox()) {
                AvastSP.bs.getLocalStorage().setItem(storage, data);
            }
            else {
                localStorage[storage] = data;
            }
        },
        /**
         * Bind onconnect, onbeforenavigate etc events - browser specific function placeholder - show be overriden by returning the correct value
         * @return {void}
         */
        bindEvents : function(){
            // browser specific events
        },
        /**
         * Load and parse all locally stored data
         * @return {[type]} [description]
         */
        load : function(){
            // load core data from localstorage
            // load cached UrlInfo
            this.Cache.load();
        },
        /**
         * get urlinfo object from cache or download it
         * @param  {Array}    urls       URLs to be validated
         * @param  {string/Array/Object} urls       URLs to be validated
         *                                - either simple url string, or
         *                                - array of URLs for multirequest call
         *                                - enhanced URL object with additional data:
         *                                  {url: , referer: , tebNum: , windowNum: }
         *                                - array of urls
         *                                - array of url detail objects: links, full SERP links
         *                                  {url: , fullUrl: }
         * @param  {Function} callback   Callback function
         * @param  {Boolean}  notvisited True if the request is MultipleRequest and user has not yet visited the site
         * @return {void}
         */
        getUrlInfo : function(urls, callback, notvisited){
            var download = [];
            var downFull = [];
            var downFullCnt = 0;
            var res = [];
            var details = null;

            if (!urls) return;

            //normalize url string to expected array format.
            var type = typeof(urls);
            if(type == "string") {
                urls = [urls];
            } else if (type == "object" && urls.url) { // object with details
                details = urls;
                urls = [urls.url];
            }

            // Try cached URLS
            for(var i=0, j=urls.length; i<j; i++) {
                var curr = urls[i], cUrl = null, cFullUrl = null;
                if (typeof(curr) === "string") {
                    cUrl = curr.trim();
                } else if (curr && curr.url){
                    cUrl = curr.url.trim();
                    cFullUrl = curr.fullUrl;
                }
                // try getting cached result
                //if(curr.indexOf("//localhost") == -1){
                if (cUrl && AvastSP.bs.checkUrl(cUrl)) {
                  var cached = this.Cache.get((cUrl.indexOf("http") === 0) ? AvastSP.Utils.getDomain(cUrl) : cUrl);
                  if (cached) {
                    res.push(cached);
                  } else {
                    // prepare for load
                    download.push(cUrl);
                    downFull.push(cFullUrl);
                    if (cFullUrl) { downFullCnt++; }
                  }
                }
            }

            // nothing to download - we can stop and return just cached data
            if(download.length === 0 && res.length > 0) return callback(res);
            // Nothing in cache and nothing left for the server - we where trying to validate on of the unsupported tabs from AvastSP.DEFAULTS.IGNORE_TABS
            if(download.length === 0) return;

            // set options for retrieving urlinfo
            var options = {
                url: download,
                safeShop: AvastSP.CONFIG.ENABLE_SAS ? 0 : -1, // NEW (-1), true = opt-in, false = opt-out  ==> 0 = opt-in, -1 = opt-out
                callback : function(r){
                    // add cached objects
                    for(var i=0, j=res.length; i<j;i++) {
                        r.push(res[i]);
                    }

                    // trigger the callback
                    callback(r);
                }
            };

            if(notvisited) options.visited = false;
            if (details) {
                options.referer = details.referer;
                options.tabNum = details.tabNum;
                options.windowNum = details.windowNum;
                options.reqServices = details.reqServices;
                options.windowEvent = (typeof details.tabUpdated === "undefined") ? EV_TYPE_CLICK :
                    details.tabUpdated ? EV_TYPE_CLICK : EV_TYPE_TABFOCUS;
            } else if (notvisited) {
                options.reqServices = 0x0007; // multi-req - get WebRep, Phishing, Blocker
            }
            if (downFullCnt > 0) {
                options.fullUrls = downFull;
            }
            // start queries and parse the results:
            new AvastSP.Query.UrlInfo(options);
        },

        /**
         * Save user vote to server
         * @param {String}   domain   domain name
         * @param {Object}   values   rating and categories {vote: 75, flags: {social: false, shopping: false, it: false, news: false, corporate: false, violence: false, pornography: false, drugs: false, gambling: false, illegal: false}}
         * @param {Function} callback handle response
         */
        setVote : function (domain, values, callback) {

            new AvastSP.Query.Vote(_.extend({
                url : domain,
                method : "put",
                callback : function(r){ if (callback) callback(r); }
            }, values));
        },
        /**
         * Get users vote from server
         * @param  {String}   domain   domain name
         * @param  {Function} callback callback for returned data
         * @return {[type]}            [description]
         */
        getVote : function (domain, callback) {

            new AvastSP.Query.Vote({
                url : domain,
                method : "post",
                callback : function(r){ callback(r); }
            });
        },
        /**
         * Send login data to server and store uuid
         * @param  {String} username    Provided username
         * @param  {String} password    Provided password
         * @return {void}
         */
        login : function(username, password){
            // TODO: get GPB from TomasTunkl.
        },
        /**
         * get new token from ID server
         * @return {[type]} [description]
         */
        loginRefresh : function() {
            // TODO: get GPB from TomasTunkl.

        },

        /**
         * Default handler for tabs.onRemoved events. Clears the tab TabReqCache.
         *
         */
        onTabRemoved : function(tabId) {
            AvastSP.TabReqCache.drop(tabId);
        }
    });

    /**
     * Browser specific code to be overriden
     */
    AvastSP.bs = {
        /**
         * Intialize platform specific features.
         */
        initPlatform : function() {
            // initiates platform specific
        },
        /**
         * Get plugin version - browser specific function placeholder - show be overriden by returning the correct value
         * @return {Number} Browser version as defined by build process for each plugin
         */
        getVersion : function(){
            // return generic value;
            return 8.0;
        },

        /**
         * Load local file and return its contents
         * @param  {String}   file     Local path relative to the extension root
         * @param  {Function} callback Callback function with file content string as first param
         * @param  {Bool}     nocache  If set to true, cached content is going to be ignored
         * @return {Object}            XMLHttpRequest object
         */
        loadFile: function(file, callback, nocache) {
          var req = new XMLHttpRequest(),
              path = AvastSP.bs.getLocalResourceURL(file);

          // Check if we can use cached value
          if (!nocache && this._loadedFiles[path]) {
            // dispatch callback function
            callback(this._loadedFiles[path]);
            // stop right here
            return false;
          }

          // The file was either not cached or we are not supposed to use it - load it
          req.open("GET", path, true);
          req.overrideMimeType("text/plain"); // prevent Firefox parse errors
          req.onreadystatechange = function() {
            if (req.readyState == 4 && (req.status == 200 || req.status == 0)) {
              // store it in cache
              if (!nocache) AvastSP.bs._loadedFiles[path] = req.responseText;
              // dispatch callback function
              callback(req.responseText);
            }
          };
          req.send(null);
          return req;
        },
        /**
         * Cache loaded files here - key = path
         * @type {Object}
         */
        _loadedFiles : {},
        /**
         * Get localization string for key - should be overriden by browser specific function
         * @param  {String} name Key for the language string
         * @return {String}      Should return translated value
         */
        getLocalizedString: function(name) {
            return name;
        },
        /**
         * PLACEHOLDER - browser specific - Verify that the tab still exists and has not been closed and execute action on it.
         * @param  {Number}   tabId    Tab Identification
         * @param  {Function} callback Function to be triggered on the tab
         * @return {void}
         */
        tabExists : function(tabId, callback){
            // extended by browser specific function
            if(callback) {
                // maintain context for the callback
                callback.call(self);
            }
        },
        /**
         * Check if the URL can be handled by URL Info (compare agains IGNORE_TABS)
         * @param  {String} url URL String
         * @return {Boolean}    true - we can handle it
         */
        checkUrl : function (url) {
            if(!url || url == "") return false;
            for(var i=0, j=AvastSP.DEFAULTS.IGNORE_TABS.length; i<j; i++) {
                if(url.indexOf(AvastSP.DEFAULTS.IGNORE_TABS[i]) > -1 ) return false;
            }
            return true;
        }

    };


    /**
     * Provide the throttled version of the function.
     */
    AvastSP.get = throttle(AvastSP.getUrlInfo, AvastSP.DEFAULTS.THROTTLE);

    AvastSP.Browser = {};


    /*******************************************************************************
     *
     *  AvastSP UrlInfo
     *
     ******************************************************************************/

    AvastSP.UrlInfo = function(url, values, multirequest) {
        this.url = url;
        // extend default value
        this.defaults = {
            rating : -1,
            weight: -1,
            flagmask : null,
            flags : {
                shopping: null,
                social: null,
                news: null,
                it: null,
                corporate: null,
                pornography: null,
                violence: null,
                gambling: null,
                drugs: null,
                illegal: null
            },
            phishing : null,
            phishingDomain : null,
            is_typo: false,
            block: -1,
            ttl : 3600,
            ttl_multi : 3600,
            ttl_phishing : 3600,
            safeShop : null
        };
        if(values.webrep) {
            // intializing from GPB
            this.values = _.extend({}, this.defaults, values.phishing, values.webrep,
                values.blocker, values.typo, {safeShop: values.safeShop});
            if(multirequest) this.values.ttl_multi = values.webrep.ttl;
            else this.values.ttl = values.webrep.ttl;

            if(values.phishing) this.values.ttl_phishing = values.phishing.ttl;
        }else {
            // initializing from cache
            this.values = _.extend({}, this.defaults, values);
        }

        // set expiration times
        this.values.expireTime =  (this.values.ttl < this.values.ttl_phishing) ? this.setExpireTime(this.values.ttl) : this.setExpireTime(this.values.ttl_phishing);
        this.values.expireTimeMulti = this.setExpireTime(this.values.ttl_multi);
        // update flags and flags bitmask
        if(this.values.flagmask) {
            this.flagsToMask();
        }
        else if(typeof this.values.flags == "number") {
            this.flagsFromMask(this.values.flags);
        }
        this.save();
    }
    AvastSP.UrlInfo.prototype = {
        /**
         * Save retrieved data to cache
         * @return {void}
         */
        save : function () {
            AvastSP.Cache.set(this.url, this);
        },
        /**
         * Clear Value of preperty
         * @param  {String} prop Property Name
         * @return {void}
         */
        clearProperty : function(prop){
            if(this.values[prop]) this.values[prop] = this.defaults[prop];
        },
        /**
         * set expiration time from now to now + ttl value
         * @param {Number} ttl TTL in miliseconds
         */
        setExpireTime : function(ttl) {
            if (typeof ttl == "undefined") {
                ttl = AvastSP.DEFAULTS.TTL;
            }
            return AvastSP.Utils.dateFormat(
                (new Date((new Date()).valueOf() + (ttl) * 1000)),
                TTL_DATE_FORMAT
            );
        },
        /**
         * Get expiration time
         * @return {Number} Timestamp
         */
        getExpireTime : function () {
            return this.values.expireTime;
        },
        /**
         * Get expiration time for multirequest
         * @return {Number} Timestamp
         */
        getExpireTimeMulti : function (){
            return this.values.expireTimeMulti;
        },
        /**
         * Get json copy of the UrlInfo data
         * @return {Object} JSON formatted url info data
         */
        getAll : function(){
            // return a copy of json data
            return _.extend({}, this.values);
        },
        /**
         * Get phishing status for this URL
         * @return {Number} 1=no phishing
         */
        getPhishing : function(){
            //return (this.values.phishing == 0) ? false : true
            return this.values.phishing;
        },
        /**
         * Get phishing status for the domain of this url
         * @return {Number} 1=no phishing
         */
        getPhishingDomain : function(){
            //return (this.values.phishingDomain == 0) ? false : true
            return this.values.phishingDomain;
        },
        /**
         * Get blocker status for this URL
         * @return {Number} 0=no malware
         */
        getBlocker : function(){
            return this.values.block;
        },
        /**
         * Get json copy of the UrlInfo data
         * @return {Number} Rating value
         */
        getRating: function(){
            //average rating over the defined ratings
            return this.values.rating;
        },
        /** ?? - was used in previous implementation - should be removed as it does
         *  brind nothing to the code
         *
        getWorstRating: function() {
            //Math.min(a,b,...) rating over the defined ratings - LEGACY
            return this.values.rating;
        },*/
        /**
         * Get Rating weight
         * @return {Number} Rating weight
         */
        getWeight : function() {
            //average weight over the defined ratings
            return this.values.weight;
        },
        /**
         * Get flags of this url
         * @return {void}
         */
        getFlags : function(selected) {
            if(!selected) return this.values.flags;

            var flags = {};
            for(var key in this.values.flags){
                if(this.values.flags[key] == true) flags[key] = true;
            }
            return flags;
        },
        /**
         * set multiple flags at once and update bitmask
         * @param {Object} flags JSON mask of URL flags
         * @return {void}
         */
        setFlags : function(flags) {
            this.values.flags = _.extend(this.values.flags, flags);
            this.flagsToBitmask();
        },
        /**
         * get flag value
         * @param  {String} flag Flag Name
         * @return {Boolean}     true = flag is set
         */
        getFlag : function(flag) {
            this.values.flags[flag];
        },
        /**
         * set a single flag value and update bitmask
         * @param {String} flag Flag Name
         * @param {Boolean} bool Flag Value
         * @return {void}
         */
        setFlag : function (flag, bool) {
            if(bool) {
                this.values.flags[flag] = true;
                this.values.flagsmask.addBitmask(AvastSP.DEFAULTS.WEBREP_FLAGS_MASK[flag]);
            } else {
                this.values.flags[flag] = null;
                this.values.flagsmask.removeBitmask(AvastSP.DEFAULTS.WEBREP_FLAGS_MASK[flag]);
            }
        },
        /**
         * Convert flags bitmask to flags object
         * @param  {Number} bitmaskvalue Integer holding a bitmask
         * @return {void}
         */
        flagsFromMask : function(bitmaskvalue) {

            this.values.flagmask = AvastSP.Utils.BitWriter(bitmaskvalue);

            this.values.flags = AvastSP.Bitmask.fromMask(this.values.flagmask, AvastSP.DEFAULTS.WEBREP_FLAGS_MASK)
        },
        /**
         * convert flags object to flags bitmask
         * @param  {Object} Optional - object with flag definition
         * @return {void}
         */
        flagsToMask : function (flags) {
            if(!flags) var flags = this.values.flags;
            this.values.flagmask = AvastSP.Bitmask.toMask(flags, AvastSP.DEFAULTS.WEBREP_FLAGS_MASK);
        },
        /**
         * Convert rating value to a category level
         * @return {Number} Category value 0-3
         */
        getRatingCategoryOld: function() {
            var rating = this.getRating();
            if((rating >= 0)&&(rating <= RATING_THRESHOLD_BAD))
                return RATING_BAD;
            else if((rating > RATING_THRESHOLD_BAD)&&(rating <= RATING_THRESHOLD_AVERAGE))
                return RATING_AVERAGE;
            else if((rating > RATING_THRESHOLD_AVERAGE)&&(rating <= RATING_THRESHOLD_GOOD))
                return RATING_GOOD;
            else
                return RATING_NONE;
        },
        /**
         * Convert rating value to a category level
         * @return {Number} Category value 0-3
         */
        getRatingCategory: function() {
            if(this.getPhishing() > 1 || this.getBlocker() > 0)
                return RATING_BAD;
            else {
                var rating = this.getRating();
                if(rating >= 0 && rating <= RATING_THRESHOLD_AVERAGE)
                    return RATING_AVERAGE;
                else
                    return RATING_GOOD;
            }
        },
        /**
         * Convert weight value to a category level
         * @return {Number} Category value 0-3
         */
        getWeightCategory: function() {
            return WEIGHT3;
            /* weight is not used at this moment
            var weight = this.getWeight();
            if((weight >= 0)&&(weight <= WEIGHT_THRESHOLD1))
            {
                return WEIGHT1;
            }
            else if((weight > WEIGHT_THRESHOLD1)&&(weight <= WEIGHT_THRESHOLD2))
            {
                return WEIGHT2;
            }
            else if((weight > WEIGHT_THRESHOLD2)&&(weight <= WEIGHT_THRESHOLD3))
            {
                return WEIGHT3;
            }
            else
            {
                return WEIGHT0;
            }*/
        },
        /**
         * Create the icon file name for current rating/weight
         * @return {String} file name (not file path)
         */
        getIcon : function() {

            // return no rating icon automatically for phishing sites.
            if(this.getPhishing() > 1 ) return ICON_STRING33;


            switch(this.getRatingCategory()){
                case RATING_NONE:
                    return ICON_STRING0;
                case RATING_GOOD:
                    switch(this.getWeightCategory()){
                        case WEIGHT1:
                            return ICON_STRING11;
                        case WEIGHT2:
                            return ICON_STRING12;
                        case WEIGHT3:
                            return ICON_STRING13;
                        default:
                            return ICON_STRING0;
                    }
                    break;
                case RATING_AVERAGE:
                    switch(this.getWeightCategory()){
                        case WEIGHT1:
                            return ICON_STRING21;
                        case WEIGHT2:
                            return ICON_STRING22;
                        case WEIGHT3:
                            return ICON_STRING23;
                        default:
                            return ICON_STRING0;
                    }
                    break;
                case RATING_BAD:
                    switch(this.getWeightCategory()){
                        case WEIGHT1:
                            return ICON_STRING31;
                        case WEIGHT2:
                            return ICON_STRING32;
                        case WEIGHT3:
                            return ICON_STRING33;
                        default:
                            return ICON_STRING0;
                    }
                    break;
                case RATING_PENDING:
                default: //Error
                    return "wrcx";
            }
        },
        /**
         * Get weight string (unlocalized) - just a keyword
         * @return {String}        Unlocalized weight description
         */
        getWeightString:function() {
            switch(this.getWeightCategory()){
                case WEIGHT0: return WEIGHT0_TEXT;
                case WEIGHT1: return WEIGHT1_TEXT;
                case WEIGHT2: return WEIGHT2_TEXT;
                case WEIGHT3: return WEIGHT3_TEXT;
                default: return WEIGHT0_TEXT;
            }
        },
        /**
         * Get rating string (unlocalized) - just a keyword
         * @return {String}        Unlocalized rating description
         */
        getRatingString:function() {
            switch(this.getRatingCategory()){
                case RATING_NONE: return RATING0_TEXT;
                case RATING_GOOD: return RATING1_TEXT;
                case RATING_AVERAGE: return RATING2_TEXT;
                case RATING_BAD: return RATING3_TEXT;
                default: return RATING0_TEXT;
            }
        },
        getScoreClass: function() {
            switch(this.getRatingCategory()){
                case RATING_NONE:
                    return "wrc0";
                case RATING_GOOD:
                    switch(this.getWeightCategory()){
                        case WEIGHT1:
                            return "wrc11";
                        case WEIGHT2:
                            return "wrc12";
                        case WEIGHT3:
                            return "wrc13";
                        default:
                            return "wrc0";
                    }
                    break;
                case RATING_AVERAGE:
                    switch(this.getWeightCategory()){
                        case WEIGHT1:
                            return "wrc21";
                        case WEIGHT2:
                            return "wrc22";
                        case WEIGHT3:
                            return "wrc23";
                        default:
                            return "wrc0";
                    }
                    break;
                case RATING_BAD:
                    switch(this.getWeightCategory()){
                        case WEIGHT1:
                            return "wrc31";
                        case WEIGHT2:
                            return "wrc32";
                        case WEIGHT3:
                            return "wrc33";
                        default:
                            return "wrc0";
                    }
                    break;
                case RATING_PENDING:
                default: //Error
                    return "wrcx";
            }
        },
    };

    /*******************************************************************************
     *
     *  AvastSP Bitmask Manipulations
     *
     ******************************************************************************/
    AvastSP.Bitmask = {

        /**
         * convert flags bitmask to flags object
         * @param  {Number} bitmaskvalue    Integer holding masked values
         * @param  {Object} mask            Decoding mask
         * @return {Object}                 Decoded JSON object
         */
        fromMask : function(bitmaskvalue, mask) {

            var bitmask = (typeof bitmaskavlue == "Number") ? AvastSP.Utils.BitWriter(bitmaskvalue) : bitmaskvalue;
            var obj = {};

            for(var m in mask){
                if(bitmask.hasBitmask(mask[m])) {
                    obj[m] = true;
                }  else {
                    obj[m] = null;
                }
            }
            return obj;
        },
        /**
         * convert flags object to flags bitmask
         * @param  {Object} obj  JSON object holding mask values
         * @param  {Object} mask Decoding mask
         * @return {Number}      Integer holding masked values
         */
        toMask : function (obj, mask) {
            var bitmask = AvastSP.Utils.BitWriter(0);
            for(var o in obj) {
                if(obj[o]) bitmask.addBitmask(mask[o]);
            }
            return bitmask;
        }

    };


    /*******************************************************************************
     *
     *  AvastSP Cache
     *
     *  @author: Ondrej Masek
     *
     ******************************************************************************/

    AvastSP.Cache = {
        cache : {},
        init : function(){
            this.load();
            this.clean();
        },
        /**
         * Load Cached data from localstorage
         * @return {void}
         */
        load : function(){

            this.storage = AvastSP.getStorage(AvastSP.DEFAULTS.CACHE.DOMAIN);
            if(typeof this.storage != "undefined" && this.storage != null) {
                this.cache = JSON.parse(this.storage);
                //cleanup cache 1 minute after start
                setTimeout(this.clean.bind(this), 60000);
            }
        },
        /**
         * Remove all expired records
         * @return {void}
         */
        clean : function() {

                for(var key in this.cache) {
                    var item = this.cache[key];
                    if(!item.expireTime || (item.expireTime.length != 14) || !this.validateTtl(item.expireTime)) {
                        this.remove(key);
                        continue;
                    }
                    this.ttl(key);
                }
        },
        /**
         * Check if the ttl has expired - if so, remove record and return undefined
         * @param  {String} key           Key of the cached item
         * @param  {Boolean} multirequest Is it a multiple request (has its own TTL)
         * @return {Object}               Return value of the key or undefined for expired keys
         */
        ttl : function(key, multirequest) {

            // no such record
            if(!this.cache[key]) return undefined;

            // was the cached record already initialized? if not, initialize it
            if(!(this.cache[key] instanceof AvastSP.UrlInfo)) {
                this.cache[key] = new AvastSP.UrlInfo(key, this.cache[key]);
            }

            if(multirequest) {
                // Getting cached item for multiple ratings
                if(!this.validateTtl(this.cache[key].getExpireTimeMulti())){
                    this.remove(key);
                    return undefined;
                }
            } else {
                // Getting cache item for visited  page
                if(!this.validateTtl(this.cache[key].getExpireTime())){
                    this.remove(key);
                    return undefined;
                }
            }
            return this.cache[key];
        },
        /**
         * Compare TTL value with current date time
         * @param  {Number} ttl TTL value formatted as yyyymmddHHMMss
         * @return {Bool}       True - TTL is not expired, False - Expired
         */
        validateTtl : function(ttl){
            var now = AvastSP.Utils.dateFormat(new Date(), TTL_DATE_FORMAT);
            return (ttl > now);
        },
        /**
         * Remove record
         * @param  {String} key Key of the Cached item
         * @return {void}
         */
        remove : function(key){
            delete this.cache[key];
        },
        /**
         * Save cache state to localstorage
         * Throttling to increase performance
         * @return {void}
         */
        save : throttle(function() {
            var json = {};
            // get json data for all cached objects
            for(var key in this.cache) {
                json[key] = (this.cache[key] instanceof AvastSP.UrlInfo) ? this.cache[key].getAll() : this.cache[key];
            }
            this.storage = JSON.stringify(json);

            AvastSP.setStorage(AvastSP.DEFAULTS.CACHE.DOMAIN, this.storage);

        }, 2000),
        /**
         * Get cached record -> goes through .ttl() to check expiration
         * @param  {String} key          Key of the cached record
         * @param  {Boolean} multirequest We are handig multirequest differently
         * @return {Object}              JSON value of URL Info
         */
        get : function(key, multirequest) {
            if(this.cache[key]) {
                // return cached object for URI
                return this.ttl(key, multirequest);
            }else if(this.cache[AvastSP.Utils.getDomain(key)]){
                // URI was not cache, but domain was - return it
                return this.ttl(AvastSP.Utils.getDomain(key), multirequest);
            }
            // no matching cache record was found
            return undefined;
        },
            /**
         * Get cached record independent of ttl used for sidebar
         * @param  {String} key          Key of the cached record
         * @param  {Boolean} multirequest We are handig multirequest differently
         * @return {Object}              JSON value of URL Info
         */
        getNoTTL : function(key) {
            if(this.cache[key]) {
                // return cached object for URI
                return this.cache[key];
            }else if(this.cache[AvastSP.Utils.getDomain(key)]){
                // URI was not cache, but domain was - return it
                return this.cache[AvastSP.Utils.getDomain(key)];
            }
            // no matching cache record was found
            return undefined;
        },
        /**
         * Set new record and save it to cache
         * @param {String} key   Key of the newly cached item
         * @param {Object} value Value of the newly cached item
         */
        set : function(key, value) {
            // delete previous instance
            if(this.cache[key]) delete this.cache[key];

            // Cache the new object for the URI
            this.cache[key] = value;

            this.save();
            // Create a cache record for the domain as well
            var domain = AvastSP.Utils.getDomain(key);
            if(key != domain && domain != null) {
                // copy the record
                this.cache[domain] = new AvastSP.UrlInfo(domain, _.extend({},value.getAll()));
                // check phishing domain and adjust the phishing property accordingly
                if(this.cache[domain].getPhishingDomain() == 1) this.cache[domain].clearProperty("phishing");
            }
        }
    };

    /*******************************************************************************
     *
     *  AvastSP Tab Request cache/store
     *
     *  @author: Martin Havelka, Salsita Software
     *
     ******************************************************************************/

    AvastSP.TabReqCache = {
        reqCache: {},

        set: function (tab_id, key, value) {
            var tab_rec = this.reqCache[tab_id];
            if (tab_rec) {
                tab_rec[key] = value;
            } else {
                tab_rec = {};
                tab_rec[key] = value;
                this.reqCache[tab_id] = tab_rec;
            }
        },

        get: function (tab_id, key) {
            var ret = null;
            var tab_rec = this.reqCache[tab_id];
            if (tab_rec) {
                ret = tab_rec[key];
            }
            return ret;
        },

        drop: function (tab_id) {
            if(this.reqCache[tab_id]) delete this.reqCache[tab_id];
        }
    };

    /*******************************************************************************
     *
     *  dateFormat impl.
     *
     *   - former "dateFormat.js"
     *
     *  @author: --
     *
     ******************************************************************************/

    var dateFormat = function() {
        var token = /d{1,4}|m{1,4}|yy(?:yy)?|([HhMsTt])\1?|[LloSZ]|"[^"]*"|'[^']*'/g,
            timezone = /\b(?:[PMCEA][SDP]T|(?:Pacific|Mountain|Central|Eastern|Atlantic) (?:Standard|Daylight|Prevailing) Time|(?:GMT|UTC)(?:[-+]\d{4})?)\b/g,
            timezoneClip = /[^-+\dA-Z]/g,
            pad = function(val, len) {
                val = String(val);
                len = len || 2;
                while (val.length < len) val = "0" + val;
                return val;
            };

        // Regexes and supporting functions are cached through closure
        return function(date, mask, utc) {
            var dF = dateFormat;

            // You can't provide utc if you skip other args (use the "UTC:" mask prefix)
            if (arguments.length == 1 && Object.prototype.toString.call(date) == "[object String]" && !/\d/.test(date)) {
                mask = date;
                date = undefined;
            }

            // Passing date through Date applies Date.parse, if necessary
            date = date ? new Date(date) : new Date;
            if (isNaN(date)) throw SyntaxError("invalid date");

            mask = String(dF.masks[mask] || mask || dF.masks["default"]);

            // Allow setting the utc argument via the mask
            if (mask.slice(0, 4) == "UTC:") {
                mask = mask.slice(4);
               utc = true;
            }

            var _ = utc ? "getUTC" : "get",
                d = date[_ + "Date"](),
                D = date[_ + "Day"](),
                m = date[_ + "Month"](),
                y = date[_ + "FullYear"](),
                H = date[_ + "Hours"](),
                M = date[_ + "Minutes"](),
                s = date[_ + "Seconds"](),
                L = date[_ + "Milliseconds"](),
                o = utc ? 0 : date.getTimezoneOffset(),
                flags = {
                    d: d,
                    dd: pad(d),
                    ddd: dF.i18n.dayNames[D],
                    dddd: dF.i18n.dayNames[D + 7],
                    m: m + 1,
                    mm: pad(m + 1),
                    mmm: dF.i18n.monthNames[m],
                    mmmm: dF.i18n.monthNames[m + 12],
                    yy: String(y).slice(2),
                    yyyy: y,
                    h: H % 12 || 12,
                    hh: pad(H % 12 || 12),
                    H: H,
                    HH: pad(H),
                    M: M,
                    MM: pad(M),
                    s: s,
                    ss: pad(s),
                    l: pad(L, 3),
                    L: pad(L > 99 ? Math.round(L / 10) : L),
                    t: H < 12 ? "a" : "p",
                    tt: H < 12 ? "am" : "pm",
                    T: H < 12 ? "A" : "P",
                    TT: H < 12 ? "AM" : "PM",
                    Z: utc ? "UTC" : (String(date).match(timezone) || [""]).pop().replace(timezoneClip, ""),
                    o: (o > 0 ? "-" : "+") + pad(Math.floor(Math.abs(o) / 60) * 100 + Math.abs(o) % 60, 4),
                    S: ["th", "st", "nd", "rd"][d % 10 > 3 ? 0 : (d % 100 - d % 10 != 10) * d % 10]
                };

            return mask.replace(token, function($0) {
                return $0 in flags ? flags[$0] : $0.slice(1, $0.length - 1);
            });
        };
    } ();

    // Some common format strings
    dateFormat.masks = {
        "default": "ddd mmm dd yyyy HH:MM:ss",
        shortDate: "m/d/yy",
        mediumDate: "mmm d, yyyy",
        longDate: "mmmm d, yyyy",
        fullDate: "dddd, mmmm d, yyyy",
        shortTime: "h:MM TT",
        mediumTime: "h:MM:ss TT",
        longTime: "h:MM:ss TT Z",
        isoDate: "yyyy-mm-dd",
        isoTime: "HH:MM:ss",
        isoDateTime: "yyyy-mm-dd'T'HH:MM:ss",
        isoUtcDateTime: "UTC:yyyy-mm-dd'T'HH:MM:ss'Z'"
    };

    // Internationalization strings
    dateFormat.i18n = {
        dayNames: [
            "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
            "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
        ],
        monthNames: [
            "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
            "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"
        ]
    };

    /*******************************************************************************
     *
     *  AvastSP UTILS
     *
     *
     *  @author: Ondrej Masek
     *
     ******************************************************************************/

    AvastSP.Utils = {

        /**
         * Throttle function.
         */
        throttle: throttle, // exporting the function, see above



        /**
         * Date formating implementaton.
         * @param {Date} date to format
         * @param {String} mask to format the date to
         * @param {String} (optional) date UTC
         */
        dateFormat: dateFormat,

        /**
         * Read object properties in N depth. Handles the cases when some objects are
         * missing on the path to the property.
         *
         *   ie. var value = AvastSP.Utils.getProperties(settings,'my','property','A');
         *
         * @param {Object} to read from
         * @param {String} any number of properties names
         */
        getProperties : function() {
            var p = 0, v = undefined;
            if (arguments.length > 0) {
                v = arguments[p++];
                while (v && p < arguments.length) {
                    v = v[arguments[p++]];
                }
            }
            return v;
        },

        /**
         * Set object properties in any depth. Handle cases when certain objects
         * are missing on the path.
         *
         *   ie. AvastSP.Utils.setProperties(settings,'my','property','A','new value');
         *
         * @param {Object} to set property of
         * @param {String} one or more names of properties to set value
         * @param {any}    value to set the property to (last argument of the call)
         */
        setProperties : function() {
            var l = arguments.length;
            if (l > 2) {
                var o = arguments[0];
                for(var i=1; i<l-2; i++) {
                    if (!o[arguments[i]]) {
                        o[arguments[i]] = {};
                    }
                    o = o[arguments[i]];
                }
                o[arguments[l-2]] = arguments[l-1];
            }
        },
        /**
         * Parse price value from price string in cents.
         * @param {String}  string with price value
         * @return {Number} price value $7.99 -> 799
         */
        getPriceValue: function(price) {
          var priceStr = (price instanceof Array) ? ((price.length > 0) ? price[0] : '') : (price || '');
          // ignore prefix, dollar/euro/... val, decimal point(./,), cents/..., ignore suffix
          var s = (/^[^0-9\.\,]*([0-9]{0,3}(?:[\.\,\s]?[0-9]{3})*?)(?:([\.\,])([0-9]{1,2}))?[^0-9]*$/i).exec(priceStr);
          var v = 0, m = 100;
          for (var i=1; i < s.length; i++) {
            var seg = s[i];
            if (seg) {
              if (seg === '.' || seg === ',') {
                m = 1; // following fractions are cents
              } else {
                v += parseFloat(String(seg).replace(/[\,\s\.]/g,'')) * m;
              }
            }
          }
          return v;
        },

        /**
         * Resolve local mocks to redirect in DNT.
         * @param {String} url to be redirected or canceled
         * @return mock file to redirect to, or null if no available
         */
        resolveLocalMock : function(url) {
            var rules = AvastSP.DEFAULTS.DNT_MOCKS_RULES;
            for (var i=0; i < rules.length; i++) {
                if (RegExp(rules[i].pattern).test(url)) {
                    return rules[i].mock;
                }
           }
           return null;
        },

        /**
         * Fix Boolean values from 1/0 or "1"/"0" to true/false
         * @param  {Number|String} n Original value
         * @return {[Bool}   Converted true/false value
         */
        fixBool : function(n){
            return (n==1 || n=='1') ? true : false;
        },
        /**
         * Strip URL and return the domain
         * @param  {String} url URL string (http://www.google.com)
         * @return {String}     Domain string (google.com)
         */
        getDomain : function(url) {
            /*if (url) {
                var url = url
                            .replace(/http:\/\/www./, "")
                            .replace(/http:\/\//, "")
                            .replace(/https:\/\/www./, "")
                            .replace(/https:\/\//, "");
                if(url.indexOf("/") > -1) {
                    url = url.substring(0, url.indexOf("/"));
                }
            }
            return url;*/
            if(url === undefined || url == null) return null;

            var target = this.getUrlTarget(url);
            if(target) url = 'http://'+target;

            var matches = url.match(new RegExp("^(ftp|http|https):\/\/(\w+:{0,1}\w*@)?(www.)?([a-z0-9\-\.]+[a-z]{2,6})(:[0-9]+)?(.*)?$"));
            if((matches) && (matches.length>4))
            {
                var protocol = matches[1];
                var credentials = matches[2];
                var www = matches[3];
                var domain = matches[4];
                var wport = matches[5];
                return domain;
            }
            return null;
        },
        /**
         * Look for redirector urls in
         * @param  {String} url Original URL
         * @return {String}     Extracted URL
         */
        getUrlTarget : function(url){
            //Recognizes target urls inside arbitrary redirector urls (also handles base64 encoded urls)
            var args = this.getUrlVars(url);

            for(var p in args) {
                if(args.hasOwnProperty(p)) {
                    //This regexp extracts domain from URL encoded address of type http
                    try {
                        //Matches URLs starting with http(s)://domain.com http(s)://www.domain.com www.domain.com
                        //optionally followed by path and GET parameters
                        //If successfull then matches[4] holds the domain name with the www. part stripped

                        var re = /((https?\:\/\/(www\.)?|www\.)(([\w|\-]+\.)+(\w+)))([\/#\?].*)?/;
                        var decoded = decodeURIComponent(args[p]);
                        var matches = decoded.match(re);
                        if(matches) {
                            return matches[2]+matches[4];
                        }

                        var b64decoded = atob(decoded);
                        matches = b64decoded.match(re);
                        if(matches) {
                            return matches[2]+matches[4];
                        }
                    }
                    catch(e)
                    {
                        //alert("Exception: "+JSON.stringify(e));
                    }
                }
            }
            return null;
        },
        /**
         * Create an object from arguments passed through GET
         * @param  {String} url URL string
         * @return {Object}     arguments as object
         */
        getUrlVars: function(url){
            //Creates an associative array of GET URL parameters
            var vars = {};
            if(url === undefined || url == null) return vars;
            var parts = url.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m, key, value)
            {
                vars[key] = value;
            });

            return vars;
        },

        /**
         * Manipulate bitmasks
         */
        BitWriter : function(n) {

            // local variables

            var bit = Math.abs(n),
                F = function() {},
                that = null;

            /**
             * Basic bitmask validate, a binary value should be 2^n power; this ensures the bit is valid by basic arithmetic
             * @method isValidBit
             * @return {Boolean} True, when a valid bitmask.
             * @private
             */
            var isValidBitmask = function(n) {
                if (0 > n) {return false;}
                var i = 0,
                    j = 1;

                while (j <= n) {
                    if (j === n) {return true;}
                    i += 1;
                    j = Math.pow(2, i);
                }

                return false;
            };

           // public interface

            F.prototype = {

                /**
                 * Adds the bitmask to the binary value; remains unchanged if n is an invalid bitmask.
                 * @method addBitmask
                 * @param n {Number} Required. Any 2^n value.
                 * @return {Number} The new binary value.
                 * @public
                 */
                addBitmask: function(n) {
                    if (! isValidBitmask(n) || that.hasBitmask(n)) {return bit;}
                    bit = (bit | n);
                    return bit;
                },

                /**
                 * Retrieves the binary value.
                 * @method getValue
                 * @return {Number} The binary value.
                 * @public
                 */
                getValue: function() {
                    return bit;
                },

                /**
                 * Tests if the bitmask is present, returning the bitmask when it is and ZERO otherwise.
                 * @method hasBitmask
                 * @param n {Number} Required. Any 2^n value.
                 * @return {Number} The value of bitmask, when present, otherwise ZERO.
                 * @public
                 */
                hasBitmask: function(n) {
                    if (! isValidBitmask(n) || n > bit) {return 0;}
                    return (bit & n);
                },

                /**
                 * Removes the bitmask to the binary value; remains unchanged if n is an invalid bitmask.
                 *  When n > the binary number, then the number is simply reduced to ZERO.
                 * @method removeBitmask
                 * @param n {Number} Required. Any 2^n value.
                 * @return {Number} The new binary value.
                 * @public
                 */
                removeBitmask: function(n) {
                    if (! isValidBitmask(n) || ! that.hasBitmask(n)) {return bit;}
                    bit = (bit ^ n);
                    return bit;
                }
            };

            that = new F();
            return that;
        },
        /**
         * Replace "%s" placeholders in strings with provided arguments.
         */
        aosFormat : function(formatted, args) {
            for (var arg in args) {
                formatted = formatted.replace("%s", args[arg]);
            }
            return formatted;
        }
    }; // AvastSP.Utils

}).call(this, _, AvastSP.PROTO);

/* Avast lib proving connection to Avast's localhost services */

(function(AvastSP, _, Q, PROTO) {

  // Interval (miliseconds) for checking if avast local port is still responding correctly
  var CHECK_LOCAL_PORT = 500000;


  var _connectAvastTimer = null;

  var _bal = null;

  AvastSP.local = AvastSP.local || {
    /**
     * Find the correct port that avast! is listening on.
     * @param  {Function} callback Callback to be initialized on successfull connection
     * @return {Promise}
     */
    connect : function(balInst){
      _bal = balInst;

      var deferred = Q.defer();

      // ignore for non-windows computers
      if(!AvastSP.CONFIG.LOCAL_ENABLED) {
         deferred.resolve( { localPort : null, avastEdition : null } );
         return deferred.promise;
      }

      this.findActiveAvastPort()
        .then (function(config) {
          // Avast responded correctly - set the port
          AvastSP.Query.CONST.LOCAL_PORT = config.port;

          _bal.emitEvent('local.init', config.port);

          this.pairWithLocal();

          deferred.resolve( { localPort : config.port, avastEdition : config.edition } );
        }.bind(this))
        .fail (function(e) {
          // if fails resolve with empty config
          deferred.resolve( { localPort : null, avastEdition : null } );
        })
        .done();

        // set avast timer to repeat port checks
        _connectAvastTimer = setInterval(this.recheckAvastPort.bind(this), CHECK_LOCAL_PORT);

      return deferred.promise;
    },

    /**
     * Iterate over possible localhost ports to find the one Avast listening on.
     * @return {void}
     */
    findActiveAvastPort : function () {
      var deferred = Q.defer();
      var conns = _.map(AvastSP.Query.CONST.LOCAL_PORTS, function(port) {
        return this.connectAvastCheck(port);
      }, this);
      var port = Q.allSettled(conns)
        .then(function (results) {
            var success = _.find(results, function (result) {
              return (result.state === "fulfilled");
            });
            if (success) {
              deferred.resolve(success.value);
            } else {
              deferred.reject(new Error("No open port found"));
            }
          })
          .done();

      return deferred.promise;
    },

    recheckAvastPort : function () {
      var currentPort = AvastSP.Query.CONST.LOCAL_PORT;
      ( (currentPort) ? this.connectAvastCheck(currentPort) : this.findActiveAvastPort() )
        .then(function (config) {
          AvastSP.Query.CONST.LOCAL_PORT = config.port;
          if (!currentPort) {
            // mising port found
            console.log('mising port');
          }
        })
        .fail(function () {
          AvastSP.Query.CONST.LOCAL_PORT = null;
          if (currentPort) {
            // port lost
            console.log('lost port');
          } else {
            // no port found yet
            console.log('mising port');
          }
        }).done();
    },

    /**
     * Test avast connection on a given port.
     * Using the ACKNOWLEDGEMENT protocol response - Array.length = 3
     *  - version = 1,2 : ['Avast', debug,   version ] - debug = '0' / '1'
     *  - version = 3   : ['Avast', version, edition ] - '0' - customer, '1' - business
     * @param  {Number}   port     Port number
     * @param  {Function} callback Callback to be initialized on successfull connection
     * @return {void}
     */
    connectAvastCheck : function(port) {
        // ignore for non-windows computers
        if(!AvastSP.CONFIG.LOCAL_ENABLED) return Q.reject();

        var deferred = Q.defer();

        // send the default GPB messsage
        new AvastSP.Query.Avast({
            type: "ACKNOWLEDGEMENT",
            server : "http://localhost:" +port+ "/command",
            callback : function(r){
                //log("Message! for port ["+ port +"]:", PROTO.decodeUTF8(r.values_.result[0]), PROTO.decodeUTF8(r.values_.result[1]));
                // Test the response (mostly there will be none, but there can be other programmes on this port)
                if(r.values_ && r.values_.result && PROTO.decodeUTF8(r.values_.result[0]) == "Avast" && r.values_.result.length > 2) {
                    var version = r.values_.result[1] ?
                      Number.parseInt( PROTO.decodeUTF8(r.values_.result[1]) ) : null;
                    var edition = r.values_.result[2] ?
                      Number.parseInt(PROTO.decodeUTF8(r.values_.result[2])) : null;
                    AvastSP.Query.CONST.LOCAL_TOKEN = r.values_.result[3] ?
                        PROTO.decodeUTF8(r.values_.result[3]) : null;
                    deferred.resolve({port: port, edition: (version === 3) ? edition : 0 } );
                    // customer edition (0) by default
                } else {
                    deferred.reject(new Error('Not connected to Avast.'));
                }
            },
            error : function(e){
                deferred.reject(new Error(e));
            }
        });
        return deferred.promise;
    },

    pairWithLocal : function () {
      AvastSP.local.getGuid()
        .then(function(ids) {
            _bal.emitEvent('local.paired', ids[0], ids[1], ids[2], ids[3]);
        });
    },

    /**
     * Get GUID value
     * @param  {Function} callback Callback function
     * @return {void}
     */
    getGuid: function(){
        // ignore for non-windows computers
        if(!AvastSP.CONFIG.LOCAL_ENABLED) return Q.reject();
        var deferred = Q.defer();
        new AvastSP.Query.Avast({
            type: "GET_GUIDS",
            callback : function(r) {
                var decoded = _.map(r.values_.result, function(v) { return v ? PROTO.decodeUTF8(v) : v; } );
                deferred.resolve(decoded);
            },
            error : function(e) {
                deferred.reject(new Error(e));
            }
        });
        return deferred.promise;
    },

    /**
     * Load all properties available through avast! programme
     * @param  {Function} callback Callback function
     * @return {void}
     */
    getProperties: function(params, callback){
        // ignore for non-windows computers
        if(!AvastSP.CONFIG.LOCAL_ENABLED) return Q.reject();

        new AvastSP.Query.Avast({
            type: "GET_PROPERTIES",
            params : params,
            callback : function(r){
                var res = [];

                for(var i=0, j=r.values_.result.length; i<j; i++){
                    res.push(PROTO.decodeUTF8(r.values_.result[i]));
                }
                if(callback) callback(res);
            }
        });
    },

    /**
     * Set all properties to avast! programme
     * @param  {Function} callback Callback function
     * @return {void}
     */
    setProperties: function(params, values, callback){
        // ignore for non-windows computers
        if(!AvastSP.CONFIG.LOCAL_ENABLED || !AvastSP.Query.CONST.LOCAL_PORT) return Q.reject();

        new AvastSP.Query.Avast({
            type: "SET_PROPERTIES",
            params : params,
            values : values,
            callback : function(r){
                if(callback) callback(r);
            }
        });
    },

    /**
     * Deprecated - here for the sake of it - Get an individual property setting. Should be handle only once with getProperties
     * @param  {String}   property Property name
     * @param  {Function} callback Callback function
     * @return {void}
     */
    getProperty : function(property, callback){
        // ignore for non-windows computers
        if(!AvastSP.CONFIG.LOCAL_ENABLED) return Q.reject();

        new AvastSP.Query.Avast({
            type: "GET_PROPERTY",
            property: property,
            callback : function(r){
                if(callback) callback(r);
            }
        });
    },
    
    /**
     * Set a property to be saved in avast! program
     * @param {String}   property Property name
     * @param {String}   value    Property value
     * @param {Function} callback Callback function
     * @return {void}
     */
    setProperty : function(property, value, callback){
        // ignore for non-windows computers
        if(!AvastSP.CONFIG.LOCAL_ENABLED || !this.CONFIG.ENABLE_SAFEZONE_CONTROL) return Q.reject();

        new AvastSP.Query.Avast({
            type: "SET_PROPERTY",
            property: property,
            value : value,
            callback : function(r){
                log(r);
                if(callback) callback(r);
            }
        });
    },

    /**
     * Get the list of banks for Safe Zone suggestions
     * @return {void}
     */
    getBanks : function(){
        // ignore for non-windows computers
        if(!AvastSP.CONFIG.LOCAL_ENABLED) return Q.reject();

        new AvastSP.Query.Avast({
            type: "GET_EBANKING_LIST",
            callback : function(r){
                log("Get Banks response: ", r);
                if(callback) callback(r);
            }
        });
    },
    /**
     * Tell avast! to create a SafeZone
     * @param  {String}   url      URL of the site
     * @param  {Function} callback Callback function
     * @return {[type]} [description]
     */
    switchToSafeZone : function(url) {
        // ignore for non-windows computers
        if(!AvastSP.CONFIG.LOCAL_ENABLED) return Q.reject();

        var deferred = Q.defer();

        new AvastSP.Query.Avast({
            type: "SWITCH_TO_SAFEZONE",
            value : url,
            callback : function(r){
              deferred.resolve(r);
            },
            error : function (e) {
              deferred.reject(e);
            }
        });

        return deferred.promise;
    },


    isSafeZoneAvailable : function() {
        // ignore for non-windows computers
        if(!AvastSP.CONFIG.LOCAL_ENABLED) return Q.reject();

        var deferred = Q.defer();

        new AvastSP.Query.Avast({
            type: "IS_SAFEZONE_AVAILABLE",
            callback : function(r){
              deferred.resolve(r);
            },
            error : function(e) {
              deferred.reject(e);
            }
        });

        return deferred.promise;
    }

  };

}).call(this, AvastSP, _, Q, AvastSP.PROTO);

var system = require('sdk/system');

const PLATFORMS = {
  winnt: 'Windows',
  darwin: 'Mac',
  linux: 'Linux'
};

AvastSP.Utils.getBrowserInfo = function () {
  var info = {
    os: PLATFORMS[system.platform] || 'Invalid',
    getBrowser: function() { return 'FIREFOX'; }, // it is FF implementation
    getBrowserVersion: function() { return system.version; },
    getOS: function() { return this.os },
    isWindows: function() { return this.os === 'Windows'; },
    isFirefox: function() { return true; },
    isChrome: function() { return false; }
  };

  return info;
};
