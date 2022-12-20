/**
 * @module logger
 * @desc Allows easy logging of the server. Allowing it to become simple to add additional
 * logging methods if a log server is ever implemented.
 */

const { Logging } = require("@google-cloud/logging");
const util = require("util");
const { GOOGLE_PROJECT_ID, GOOGLE_LOG_NAME } = require("./config.js").getConfig();
let log;

if (process.env.PULSAR_STATUS === "dev") {
   const logging = new Logging();
   log = logging.logSync(GOOGLE_LOG_NAME);
   // This sets the logs to fallback to stdout
} else {
  const logging = new Logging({ GOOGLE_PROJECT_ID });
  log = logging.log(GOOGLE_LOG_NAME);
}

const { LOG_LEVEL, LOG_FORMAT } = require("./config.js").getConfig();

/**
 * @function httpLog
 * @desc The standard logger for HTTP calls. Logging in a modified 'Apache Combined Log Format'.
 * @param {object} req - The `Request` object inherited from the Express endpoint.
 * @param {object} res - The `Response` object inherited from the Express endpoint.
 * @example <caption>Logging Output Format</caption>
 * HTTP:: IP [DATE (as ISO String)] "HTTP_METHOD URL PROTOCOL" STATUS_CODE DURATION_OF_REQUESTms
 */
function httpLog(req, res) {
  let date = new Date();
  let duration = Date.now() - (req.start ?? Date.now());
  console.log(
    `HTTP:: ${req.ip ?? "NO_IP"} [${date.toISOString() ?? "NO_DATE"}] "${
      req.method ?? "NO_METHOD"
    } ${sanitizeLogs(req.url) ?? "NO_URL"} ${req.protocol ?? "NO_PROT"}" ${
      res.statusCode ?? "NO_STATUS"
    } ${duration}ms`
  );
}


function parseExpressForLog(req, res) {
  let date = new Date();
  let duration = Date.now() - req.start;
  return {
    requestMethod: req.method,
    requestUrl: req.url,
    status: res.statusCode,
    //responseSize: ,
    //userAgent: ,
    remoteIp: req.ip,
    //serverIp: ,
    //referer: ,
    latency: duration,
    //cacheLookup: ,
    //cacheHit: ,
    //cacheValidateWithOriginServer: ,
    //cacheFillBytes: ,
    protocol: req.protocol,
  };
}

/**
  * @function heavyLog
  * @desc The new logger for traceability, and usability.
  * This logger will log to the cloud if determined to be prod in the setup, otherwise will
  * write the logs to stdout.
  * Using `heavyLog` will need to be done on endpoints that now integrate with the new traceability vision.
  * That is heavyLog is called at the end of an HTTP endpoint from supported portions of code.
  * @param {array} arr - The Array of Server Status Objects Collected over an endpoints lifetime.
  * @param {object} req - The ExpressJS inherited Request Object for the full request.
  * @param {object} res - The ExpressJS inherited Response Object for the full transaction.
  */
function heavyLog(arr, req, res) {
  // We are potentially being handed lots of data all at once, including
  // multiple server status objects, and any nested logs attached.
  let logEntries = [];

  for (let i = 0; i < arr.length; i++) {
    let tmpData = arr[log];
    tmpData.spanId = req.trace;
    logEntries.push(tmpData, arr[short]);
  }
  // Then lets add our HTTP Return to the end.
  let httpObj = {
    httpRequest: parseExpressForLog(req, res),
    spanId: req.trace,
  };
  logEntries.push(httpObj, "Returned Request");

  log.write(logEntries);
}

/**
 * @function sanitizeLogs
 * @desc This function intends to assist in sanitizing values from users that
 * are input into the logs. Ensuring log forgery does not occur.
 * And to help ensure that other malicious actions are unable to take place to
 * admins reviewing the logs.
 * @param {string} val - The user provided value to sanitize.
 * @returns {string} A sanitized log from the provided value.
 * @see {@link https://cwe.mitre.org/data/definitions/117.html}
 * @depreciated Use `logger.agnostic()` instead
 */
function sanitizeLogs(val) {
  // Removes New Line, Carriage Return, Tabs,
  // TODO: Should probably also defend against links within this.
  return val?.replace(/\n|\r/g, "")?.replace(/\t/g, "");
}

/**
 * @function generic
 * @desc A generic logger, that will can accept all types of logs. And from then
 * create warning, or info logs debending on the Log Level provided.
 * Additionally the generic logger accepts a meta object argument, to extend
 * it's logging capabilities, to include system objects, or otherwise unexpected values.
 * It will have support for certain objects in the meta field to create specific
 * logs, but otherwise will attempt to display the data provided.
 * @param {integer} lvl - The Log Level to output. With the following definition.
 * 1 - Fatal
 * 2 - Error
 * 3 - Warning
 * 4 - Information
 * 5 - Debug
 * 6 - Trace
 * @param {string} val - The main information to contain within the log.
 * @param {object} [meta] - An optional Object to include, this object as described
 * above can contain additional information either expected of the log, or that
 * is not natively supported, but will be attempted to display.
 */
function generic(lvl, val, meta = {}) {
  if (lvl === undefined) {
    // we will use our own supported logging to log that an invalid log was attempted.
    lvl = 6;
  }
  if (val === undefined) {
    val = "logger.generic() Called with Missing `val`";
  }

  // Now to check through our supported meta keys.

  // Additionally this will support a set of log types. The log type will determine
  // the structure of the resulting log message.
  // Supported Types:
  // default - The log will prioritze the val passed, and not much else.
  // object - Would also require the meta.obj to be set to an object you'd like to
  //          to appear in the log.
  // error - The log will prioritze searching for error details.
  //    If error is specified try to include the following additional meta property.
  //      err - The raw error message thrown whenever possible.

  // Now before we do any processing on the log, lets determine if it's within our
  // server config log level.
  if (lvl > LOG_LEVEL) {
    // Since the level here is lower than the defined log level we will return
    // without any activity.
    return;
  }

  let type = "default";
  if (meta.type !== undefined) {
    type = meta.type;
  }

  let output = "";

  switch (lvl) {
    case 1:
      output += `[FATAL]:: ${val ?? ""}`;
      break;
    case 2:
      output += `[ERROR]:: ${val ?? ""}`;
      break;
    case 3:
      output += `[WARNING]:: ${val ?? ""}`;
      break;
    case 4:
      output += `[INFO]:: ${val ?? ""}`;
      break;
    case 5:
      output += `[DEBUG]:: ${val ?? ""}`;
      break;
    case 6:
      output += `[TRACE]:: ${val ?? ""}`;
      break;
    default:
      output += `[UNSUPORTED]:: ${val ?? ""}`;
      break;
  }

  switch (type) {
    case "error":
      output += craftError(meta);
      break;
    case "object":
      if (meta.obj !== undefined) {
        output += util.inspect(meta.obj);
      }
      break;
    case "http":
      if (meta.obj !== undefined) {
        output += craftHttp(meta);
      }
      break;
    case "default":
    default:
      break;
  }

  switch (LOG_FORMAT) {
    case "stdout":
      console.log(sanitizeLogs(output));
      break;
    default:
      // Unsupported method. Use "stdout" by default.
      console.log("#BAD_LOG_FORMAT#" + sanitizeLogs(output));
      break;
  }
}

/**
 * @function craftError
 * @desc Used to help `logger.generic()` build it's logs. Used when type is
 * specified as `error`.
 * @param {object} meta - An object containing `err`.
 * @returns {string} A crafted string message containing the output of the data
 * provided.
 */
function craftError(meta) {
  // This takes the meta object from the generic error handler, and returns a string
  // depending on what values are provided and supported.
  let ret = "";

  if (meta.err) {
    ret += ` ${meta.err.name ?? "Error"} Occured: ${
      meta.err.fileName !== undefined && meta.err.lineNumber !== undefined
        ? ` in ${meta.err.fileName}#${meta.err.lineNumber}`
        : ""
    }: ${meta.err.cause ?? meta.err?.toString()}`;
  } else {
    ret += " Unspecified Error Occured.";
  }
  return ret;
}

/**
 * @function craftHttp
 * @desc Used to help `logger.generic()` build it's logs. Used when type is
 * specified as `http`. Based largely off `logger.httpLog()`
 * @param {string} meta - An object containing `req`, and `res`
 * @returns {string} A crafted string message containing the output of the data
 * provided.
 */
function craftHttp(meta) {
  let ret = "";

  if (meta.req && meta.res) {
    let date = new Date();
    let duration = Date.now() - (req.start ?? Date.now());

    ret += `HTTP:: ${meta.req.ip ?? "NO_IP"} [${
      date.toISOString ?? "NO_DATE"
    }] "${meta.req.method ?? "NO_METHOD"} ${
      sanitizeLogs(meta.req.url) ?? "NO_URL"
    } ${meta.req.protocol ?? "NO_PROT"}" ${
      meta.res.statusCode ?? "NO_STATUS"
    } ${duration ?? ""}ms`;
  } else {
    ret += " Unspecified HTTP Values Declared";
  }
  return ret;
}

module.exports = {
  httpLog,
  sanitizeLogs,
  generic,
  heavyLog,
};
