import { version } from '../../package.json';
import Debug from 'debug';
import request from 'superagent-promise';
import urljoin from 'url-join';
import util from 'util';
import Project from './project';

let debug = Debug('testdroid-client');

function sleep(duration) {
  return new Promise(function(accept) {
    setTimeout(accept, duration);
    });
}

/**
 * Initializes a new Testdroid client to be used with the Testdroid Cloud API.
 *
 * Examples:
 *
 * var Testdroid = require('testdroid-client');

 * var username = 'joe@example.com';
 * var password = '123456';
 * var cloudUrl = 'http://cloudurl/';

 * var client = new Testdroid(cloudUrl, username, password);

 * // Get list of devices

 * client.getDevices().then(function(devices) {
    console.dir(getDevices);
 * });
 *
 * @param {String} url - URL of the cloud api
 * @param {String} username
 * @param {String} password
 */
export default class {
  constructor(url, username, password) {
    this.version = version;
    this.baseUrl = url;
    this.apiUrl = url + 'api/v2/';
    this.username = username;
    this.password = password;
    this.userAgent = `testdroid-client/${this.version}`;
  }

  /**
   * Submits a request to the api endpoint.  Options can be passed in for payload and
   * additional headers.
   *
   * Example options:
   * var requestOptions = {
   *   'headers': {
   *     'x-user': 'foo'
   *    },
   *    'payload': {
   *      'limit': 1
   *    }
   * };
   *
   * __request('get', '/devices', requestOptions);
   *
   * @param {String} method - method for the request.  'get' or 'post'
   * @param {String} path - endpoint to submit request to
   * @param {opts} opts - optional opts to include.  Maybe include payload and/or headers
   * @returns {Object} Response
   */
  async __request(method, path, opts={}) {
    let endpoint = urljoin(this.apiUrl, path);
    let payload = 'payload' in opts ? opts.payload : {};
    let headers = await this.buildHeaders(opts.headers);
    let req = request(method.toUpperCase(), endpoint);

    req.set(headers);

    if (method.toUpperCase() === 'GET') {
      req.query(payload);
    } else {
      req.send(payload);
    }

    var res = await req.end();
    return res;
  }

  /**
   * Creates headers for request.  Main purpose here is to inject the auth token
   * into the headers for each reqeust.
   *
   * @param {Object} headers - Additional headers to be included
   *
   * @returns {Object}
   */
  async buildHeaders(headers={}) {
    let token = await this.getToken();
    headers.Authorization = `Bearer ${token}`;

    if (!('Accept' in headers)) {
      headers.Accept = 'application/json';
    }

    return headers;
  }

  /**
   * Sends a delete request
   *
   * @param {String} path
   *
   * @returns {Object}
   */
  async del(path) {
    debug("Deleting '/%s'", path);
    let res = await this.__request('delete', path);

    if (!res.ok) {
      throw new Error(res.error);

    }

    return res;
  }

  /**
   * Submits a get request to the cloud api with optional query string.  Query
   * parameters are supplied in the payload of the options passed in.
   *
   * Payload may container either an object to be serialized into a query string
   * or the query string itself.
   *
   * Examples:
   * // Get request using payload as object
   * client.get('/devices', { 'payload': { 'limit': 1 } });
   *
   * @param {String} path - API endpoint to submit post request to.
   * @param {Object} opts - Payload to send.
   * * @returns {Object} Response
   */
  async get(path, opts={}) {
    debug("Retrieving '/%s' with opts: %j", path, opts);
    let res = await this.__request('get', path, opts);

    if (!res.ok) {
      throw new Error(res.error);

    }

    return res;
  }

  /**
   * Retrieves all devices.
   * @param {Number} limit - number of devices to return
   * @returns {Array}
   */
  async getDevices(limit=0) {
    let opts = { 'payload': { 'limit': limit }};
    let res = await this.get('devices', opts);
    return res.body.data;
  }

  /**
   * Retrieves all devices matching a given name.
   * @param {String} deviceName - Name of the device
   * @return {Object} Device information
   */
  async getDevicesByName(deviceName) {
    let devices = await this.getDevices();

    let matchedDevices = devices.filter((device) => {
      return device.displayName === deviceName;
    });

    return matchedDevices;
  }

  /**
   * Retreives devices with a given label.
   *
   * @param {Object} Label object as returned from methods such as getLabelinGroup.
   *
   * @returns {Array}
   */
  async getDevicesWithLabel(label) {
    if (!label) return;

    debug(`Retrieving devices with label ${label.displayName}`);
    let opts = { 'payload': { 'label_id[]':  label.id, 'limit': 0}};
    let res = await this.get('devices', opts);

    if (!res.ok) {
      let err = (
        `Request for devices with label ${label.displayName} ` +
        `could not be completed. ${res.error.message}`
      );

      debug(err);
      throw new Error(err);
    }

    return res.body.data;
  }

  /**
   * Gets a specific label group
   *
   * @param {String} labelName - Name of the label group
   *
   * @returns {Array}
   */
  async getLabelGroup(labelName) {
    if (!labelName) return;

    debug(`Retrieving ${labelName} label group`);
    let search = {'search': labelName};
    let res = await this.get('label-groups', {'payload': search});

    if (!res.ok) {
      let err = `Could not complete request to find label group. ${res.error.message}`;
      debug(err);
      throw new Error(err);
    }

    return res.body.data.find(l => l.displayName === labelName);
  }

  /**
   * Retrieves label within a specific label group.
   *
   * @param {String} labelName
   * @param {Object} labelGroup
   *
   * @returns {Object}
   */
  async getLabelInGroup(labelName, labelGroup) {
    if (!labelName || !labelGroup) return;

    debug(`Retrieving label '${labelName}' in label group ${labelGroup.displayName}`);
    let payload = { 'payload': { 'search': labelName } };
    let res = await this.get(`label-groups/${labelGroup.id}/labels`, payload);

    if (!res.ok) {
      let err = `Could not retrieve label. Error: ${res.error.message}`;
      debug(err);
      throw new Error(err);
    }

    return res.body.data.find(l => l.displayName === labelName);
  }

  /**
   * Retrieves all user configured projects
   *
   * @param {Number} limit - Return only 'limit' entries. Default: all
   *
   * @return {Array} Array of Project instances
   */
  async getProjects(limit) {
    limit = typeof(limit) === 'number' ? limit : 0;
    let res = await this.get('me/projects', {'payload': { 'limit': limit } });

    if (!res.ok) {
      let err = 'Could not retrieve projects.';
      debug(err);
      throw new Error(err);
    }

    if (!res.body.data.length) return [];

    let projects = res.body.data.map((project) => {
      return new Project(this, project);
    });

    return projects;
  }

  /**
   * Retrieves project with the given name
   *
   * @param {String} projectName
   *
   * @returns {Object} Project - new project instance
   */
  async getProject(projectName) {
    if (!projectName) return;
    let res = await this.get('me/projects', {'payload': { 'search': projectName} });

    if (!res.ok) {
      let err = 'Could not retrieve projects.';
      debug(err);
      throw new Error(err);
    }

    // find exact match
    let project = res.body.data.find(p => p.name === projectName);

    if (!project) return;

    return new Project(this, project);
  }

  /**
   * Creates proxy for adb and marionette commands.  ADB proxy will return
   * device information such as serial number as well as ADB host/port to use
   * for things like gaiatest (--adb-host option).  This operation can take up
   * to 120 seconds depending on how long the remote host takes to create a
   * proxy session.  Usually this is done within a second or two though.
   *
   * @param {String} type - 'adb' or 'marionette' proxy type
   * @param {String} sessionId - ID for the current session as returned by startDeviceSession
   * @returns {Object} Proxy session information
   */
  async getProxy(type, sessionId) {
    debug(`Creating ${type} proxied session`);
    let opts = {
      'payload': {
        'type': type,
        'sessionId': sessionId
      }
    };

    let res;
    let maxRetries = 30;
    let queryFormat = "{\"type\":\"%s\", \"sessionId\": %d}";
    // Attempt to get a proxied adb/marionette connection.  Stop after 150 seconds
    for (let i = 1; i <= maxRetries; i++) {
      debug(`Creating proxied '${type}' session. Attempt ${i} of ${maxRetries}`);
      let encodedQuery = encodeURIComponent(util.format(queryFormat, type, sessionId));
      res = await this.get(util.format('proxy-plugin/proxies?where=%s', encodedQuery));
      if (res.ok && res.body && res.body.length) break ;
      // Sleep for 5 seconds to give remote a chance to create proxied session
      await sleep(5000);
    }

    if (!res.ok || !res.body.length) {
      var err = `Could not get ${type} proxy session for ${sessionId}`;
      debug(err);
      throw new Error(err);
    }

    return res.body[0];
  }

  /**
   * Retrieves authorization token.  If client currently has token, then a refresh
   * will be done and new token returned.
   *
   * returns {String}
   */
  async getToken() {
    let authUrl = urljoin(this.baseUrl, 'oauth/token');
    let payload;
    if (!this.token || Date.now() > this.tokenExpiration) {
      debug('requesting new token');
      payload = {
        'client_id': 'testdroid-cloud-api',
        'grant_type': 'password',
        'username': this.username,
        'password': this.password
      };
    } else {
      // only refresh if within 1 minute
      if (this.tokenExpiration > (Date.now()+60000)) {
        debug('no need to refresh token');
        return this.token;
      }
      debug('refreshing token');
      payload = {
        'client_id': 'testdroid-cloud-api',
        'grant_type': 'refresh_token',
        'refresh_token': this.refreshToken
      };
    }

    let headers = {
      'User-Agent': this.userAgent,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    };

    let res = await request.post(authUrl)
                           .set(headers)
                           .send(payload)
                           .end();

    if (!res.ok) {
      throw new Error(
        `Could not retrieve token. Error Reponse: ${res.body.error_description}`
      );
    }

    this.refreshToken = res.body.refresh_token;
    this.token = res.body.access_token;
    this.tokenExpiration = new Date(Date.now() + (res.body.expires_in * 1000));

    return res.body.access_token;
  }

  /**
   * Submits a post request to the cloud api with optional payload.
   *
   * @param {String} path - API endpoint to submit post request to.
   * @param {Object} opts - Payload to send
   * @returns {Object} Response
   */
  async post(path, opts={}) {
    debug("Submitting to %s with opts: %j", path, opts);
    opts.headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    let res = await this.__request('post', path, opts);

    return res;
  }

  /**
   * Creates a device session for a particular device ID.
   *
   * @param {String} deviceId - ID of the device as returned by getDevices or getDeviceByName
   * @returns {Object} Information about the device session including session ID which is used elsewhere.
   */
  async startDeviceSession(deviceId) {
    debug("Creating a device session for '%s'", deviceId);
    let payload = { 'deviceModelId': deviceId };
    let res = await this.post('me/device-sessions', { 'payload': payload });

    if (!res.ok) {
      var err = `Could not create session for ${deviceId}. ${res.error.message}`;
      debug(err);
      throw new Error(err);
    }

    debug(`Started device session: Session ID: ${res.body.id}`);

    return res.body;
  }

  /**
   * Releases a device session so that it can be used by other clients.
   *
   * @param {String} sessionId - ID of the session to release
   */
  async stopDeviceSession(sessionId) {
    debug(`Stopping device session ${sessionId}`);
    let path = `me/device-sessions/${sessionId}/release`;
    let res = await this.post(path);

    if (!res.ok) {
      throw new Error(
        `Could not stop the session properly for ${sessionId}.  ${res.error.message}`
      );
    }

    return res;
  }

}

