import { Client } from 'node-rest-client';
import moment from 'moment';
import fs from 'fs'

export default class Api {
  constructor(clientId, clientSecret) {
    this.client = new Client({
      mimetypes: {
        json: ["application/json", "application/json;charset=utf-8"],
      }
    });

    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.authorizationCode = new Buffer(`${clientId}:${clientSecret}`).toString('base64');

    // Try to use token from file to avoid unnecessary API call
    if (fs.existsSync('credentials.json')) {
      const credentials = JSON.parse(fs.readFileSync('credentials.json'));
      this.accessToken = credentials.access_token;
      this.tokenExpireTime = parseInt(credentials.issued_at, 10) + parseInt(credentials.expires_in, 10);
    } else {
      this.accessToken = undefined;
      this.tokenExpireTime = undefined;
    }
  }

  /**
   * Random unique transaction id generator function
   */
  getGuid() {
    function s4() {
      return Math.floor((1 + Math.random()) * 0x10000)
        .toString(16)
        .substring(1);
    }
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
      s4() + '-' + s4() + s4() + s4();
  }

  /**
   * Check if token has expired
   */
  isTokenExpired() {
    if (this.tokenExpireTime && this.tokenExpireTime > Date.now()) {
      return false;
    }
    return true;
  }

  /**
   * Bootstrap function
   * 
   * @param {Fucntion} callback - The callback that handles the response.
   * @return {Fucntion} - Returns "error"
   */
  init(callback) {
    this.getToken(function (err) {
      return callback(err);
    })
  }

  /**
   * Function to call api method
   * 
   * @param {Object} url - Api endpoint
   * @param {Object} args - client arguments
   * @param {Fucntion} callback - The callback that handles the response.
   * @return {Fucntion} - Returns "error" and "data"
   */
  callApi(url, args, callback) {
    if (!args) {
      args = {
        headers: {
          apikey: this.clientId,
          transactionid: this.getGuid(),
          requesttimestamp: moment().format('DD/MM/YYYY HH:mm:ss A'),
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json; charset=utf-8',
        }
      };
    }

    var req = this.client.get(url, args, function (data, response) {
      return callback(null, data);
    });

    req.on('requestTimeout', function (req) {
      req.abort();
    });

    //it's usefull to handle request errors to avoid, for example, socket hang up errors on request timeouts 
    req.on('error', function (err) {
      return callback(err);
    });
  }

  /**
  * Function that gets acces token
  * 
  * @param {Fucntion} callback - The callback that handles the response.
  * @return {Fucntion} - Returns "error" and "access_token"
  */
  getToken(callback) {
    if (!this.isTokenExpired()) {
      return callback();
    }

    this.callApi('https://api.onegov.nsw.gov.au/oauth/client_credential/accesstoken', {
      parameters: {
        grant_type: 'client_credentials',
      },
      headers: {
        authorization: `Basic ${this.authorizationCode}`,
        'Content-Type': 'application/json; charset=utf-8',
      }
    }, (err, data) => {
      if (!err) {
        this.accessToken = data.access_token;
        this.tokenExpireTime = parseInt(data.issued_at, 10) + parseInt(data.expires_in, 10);

        // Save credentials to file
        fs.writeFile('credentials.json', JSON.stringify(data), 'utf8');
      }
      return callback(err);
    });
  }

  /**
   * Function to get all fuel prices
   * 
   * @param {Fucntion} callback - The callback that handles the response.
   * @return {Fucntion} - Returns "error" and "data"
   */
  getAllFuelPrices(callback) {
    this.getToken((err) => {
      this.callApi('https://api.onegov.nsw.gov.au/FuelPriceCheck/v1/fuel/prices', null, function (err, data) {
        return callback(err, data);
      });
    });
  }


  /**
   * Function to get lates fuel prices since the last call
   * 
   * @param {Fucntion} callback - The callback that handles the response.
   * @return {Fucntion} - Returns "error" and "data"
   */
  getNewFuelPrices(callback) {
    this.getToken((err) => {
      this.callApi('https://api.onegov.nsw.gov.au/FuelPriceCheck/v1/fuel/prices/new', null, function (err, data) {
        return callback(err, data);
      });
    });
  }
}
