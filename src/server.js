import express from 'express';
import exphbs from 'express-handlebars';
import nodemexphbs from 'nodemailer-express-handlebars';
import nodemailer from 'nodemailer';
import equall from 'is-equal-shallow' ;
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
  return Math.round((Math.floor(Math.random() * (max - min)) + min) * 100.0) / 100.0;
}

const stationsWhitelist = [63, 322, 327, 854, 1306, 1377];
const pricesWhitelist = ['E10', 'U91'];
const stations = {};
const stationUpd ={};
let stationsForEmail = {};
let lastApiDate = '';

const Api = new NswApi(config.clientId, config.clientSecret);


Api.init((err) => {
  Api.getAllFuelPrices((err, data) => {
    lastApiDate = moment().utcOffset(10).format('DD/MM/YYYY HH:mm:ss');

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
            varianceClass: {
              ...stations[stationcode].varianceClass,
              [price.fueltype]: 'muted',
            },
          };
          stations[stationcode] = station;

          if(station.pricesNew){
            if(station.pricesNew.E10){
            stations.price+=`${station.pricesNew.E10.price}`;
          }
          }
          if(station.pricesNew){
            if(station.pricesNew.U91){
              stations.price +=`${station.pricesNew.U91.price}`;
            }
          }




        }
      })
       console.log( stations.price);
    }

    // Periodic update
    setInterval(() => {
      var isEdit = true ;
      Api.getNewFuelPrices((err, data) => {
        lastApiDate = moment().utcOffset(10).format('DD/MM/YYYY HH:mm:ss');
        if (!err) {
          // Parse prices
          data.prices.forEach((price) => {
            const stationcode = parseInt(price.stationcode, 10);

            if (stationsWhitelist.indexOf(stationcode) > -1 && pricesWhitelist.indexOf(price.fueltype) > -1) {
              // price.price = price.price + getRandomArbitrary(-5, 3);

              const lastupdated = dateUTCtoSydney(price.lastupdated);
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
                    lastupdated,
                  }
                },
                variance: {
                  ...stations[stationcode].variance,
                  [price.fueltype]: variance,
                },
                varianceClass: {
                  ...stations[stationcode].varianceClass,
                  [price.fueltype]: varianceClass,
                },
                update: true,
              };

              stationUpd[stationcode] = station;

              if(station.pricesNew){
                if(station.pricesNew.E10){
                  stationUpd.price+=`${station.pricesNew.E10.price}`;
                }
              }
              if(station.pricesNew){
                if(station.pricesNew.U91){
                  stationUpd.price +=`${station.pricesNew.U91.price}`;
                }
              }

              stationsForEmail[stationcode] = station;
            }

          });
          console.log(stationUpd.price);

          if(equall(stationUpd.price , stations.price) === false){
            isEdit = false
          }

          stations.price = stationUpd.price;
          console.log(stations.price);

          delete stationUpd.price ;

          console.log(isEdit);








            if(isEdit === false){
              console.log(Object.keys(stationsForEmail).length);

              if (Object.keys(stationsForEmail).length > 0) {
                let transporter = nodemailer.createTransport({
                  streamTransport: true,
                  newline: 'windows'
                });

                if (!config.isDev) {
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
                  from: 'info@bidgroup.com.au',
                  to: process.env.EMAIL,
                  subject: 'Fuel prices changed',
                  template: 'email',
                  context: {
                    stations: stationsForEmail
                  },
                }, (err, info) => {
                  stationsForEmail = {}; // clear mail list
                  info.message.pipe(process.stdout);
                  if (error) {
                    console.log(error);
                  }
                  console.log('Message %s sent: %s', info.messageId, info.response);
                });
              }


          }
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
    date: lastApiDate,
  });
});

app.listen(config.port, (error) => {
  if (error) {
    console.error(error)
  } else {
    console.info(`local: http://${config.ip}:${config.port}`)
  }
})
