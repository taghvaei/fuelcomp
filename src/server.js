import express from 'express';
import exphbs from 'express-handlebars';
import nodemexphbs from 'nodemailer-express-handlebars';
import nodemailer from 'nodemailer';
import moment from 'moment';
import fs from 'fs';
import NswApi from './api';
import config from './config'

/**
 *
 * @param {String} date - date in format "DD/MM/YYYY HH:mm:ss"
 * @return {String} - in format "DD/MM/YYYY HH:mm:ss"
 */
function dateUTCtoSydney(date) {
  const dateMatch = date.match(/(\d+)\/(\d+)\/(\d+)\s(\d+:\d+:\d+)/);
  const isoDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]} ${dateMatch[4]}.000+00:00`;

  return moment(isoDate).utcOffset(10).format('DD/MM/YYYY HH:mm:ss');
}

function getRandomArbitrary(min, max) {
  return Math.round((Math.floor(Math.random() * (max - min)) + min) * 100.0)/100.0;
}

const stationsWhitelist = [63, 322, 327, 854, 1306, 1377];
const pricesWhitelist = ['E10', 'U91'];
const stations = {};
let stationsForEmail = {};

const Api = new NswApi(config.clientId, config.clientSecret);

let datas;


Api.init((err) => {
  Api.getAllFuelPrices((err, data) => {

    datas = Object.assign(data);

    if (!err) {
      // Parse stations
      data.stations.forEach((station) => {
        const stationcode = parseInt(station.code, 10);

        if (stationsWhitelist.indexOf(stationcode) > -1) {
          stations[stationcode] = {
            ...station,
            pricesOld: {},
            pricesNew: {},
            variance: {},
            varianceClass: {},
          };
        }
      });

      // Parse prices
      data.prices.forEach((price) => {
        const stationcode = parseInt(price.stationcode, 10);

        if (stationsWhitelist.indexOf(stationcode) > -1 && pricesWhitelist.indexOf(price.fueltype) > -1) {
          const lastupdated = dateUTCtoSydney(price.lastupdated)

          const station = {
            ...stations[stationcode],
            pricesOld: {
              ...stations[stationcode].pricesOld,
              [price.fueltype]: {
                ...price,
                lastupdated,
              },
            },
            pricesNew: {
              ...stations[stationcode].pricesNew,
              [price.fueltype]: {
                ...price,
                lastupdated,
              },
            },
            variance: {
              ...stations[stationcode].variance,
              [price.fueltype]: 0,
            },
            varianceClass : {
              ...stations[stationcode].varianceClass,
              [price.fueltype]: 'muted',
            },
          }

          stations[stationcode] = station;
        }
     });
    }

    // Periodic update
    setInterval(() => {
      Api.getNewFuelPrices((err, data) => {
        if (!err) {
          // Parse prices
          datas.prices.forEach((price) => {
            const stationcode = parseInt(price.stationcode, 10);

            if (stationsWhitelist.indexOf(stationcode) > -1 && pricesWhitelist.indexOf(price.fueltype) > -1) {
              // price.price = price.price + getRandomArbitrary(-5, 3);

              const lastupdated = dateUTCtoSydney(price.lastupdated)
              let variance = parseFloat(price.price) - parseFloat(stations[stationcode].pricesNew[price.fueltype].price);
              variance = Math.round(variance * 100.0) / 100.0;

              let varianceClass = stations[stationcode].varianceClass[price.fueltype];
              if (variance > 0) {
                varianceClass = 'success';
              } else if (variance < 0) {
                varianceClass = 'danger';
              }

              const station = {
                ...stations[stationcode],
                pricesOld: {
                  ...stations[stationcode].pricesOld,
                  [price.fueltype]: {
                    ...stations[stationcode].pricesNew[price.fueltype],
                  }
                },
                pricesNew: {
                  ...stations[stationcode].pricesNew,
                  [price.fueltype]: {
                    ...price,
                  }
                },
                variance: {
                  ...stations[stationcode].variance,
                  [price.fueltype]: variance,
                },
                varianceClass : {
                  ...stations[stationcode].varianceClass,
                  [price.fueltype]: varianceClass,
                },
                update: true,
              };

              stations[stationcode] = station;
              stationsForEmail[stationcode] = station;
            }
          });

          if (Object.keys(stationsForEmail).length !== 0) {
            let transporter = nodemailer.createTransport({
                streamTransport: true,
                newline: 'windows'
            });

            if(!config.isDev) {
              transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: process.env.SMTP_PORT,
                secure: true, // use TLS
                auth: {
                  user: process.env.SMTP_USER,
                  pass: process.env.SMTP_PASS,
                }
              });
            }

            transporter.use('compile', nodemexphbs({ viewPath: __dirname + '/views' }));

            transporter.sendMail({
              from: 'info@fuelcomp.com',
              to: process.env.EMAIL,
              subject: 'Fuel prices changed',
              template: 'email',
              context: {
                stations: stationsForEmail
              },
            }, (err, info) => {
              // console.log(info.envelope);
              // console.log(info.messageId);
              stationsForEmail = {}; // clear mail list
              info.message.pipe(process.stdout);
            });
          }
          // console.log('updated');
        }
      });
    }, 1000 * 60 * config.timeout); // Every 20 minutes

  });
});


// EXpress server
const app = express();

// Register '.mustache' extension with The Mustache Express
app.engine('handlebars', exphbs({ defaultLayout: 'main', layoutsDir: 'src/views/layouts/' }));

app.set('view engine', 'handlebars');
app.set('views', __dirname + '/views');

// Serving static content
app.use(express.static('public'))

app.get('/', (req, res) => {
  res.render('index', {
    stations: stations,
  });
});

app.listen(config.port, (error) => {
  if (error) {
    console.error(error)
  } else {
    console.info(`local: http://${config.ip}:${config.port}`)
  }
})
