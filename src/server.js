import express from 'express';
import exphbs from 'express-handlebars';
import nodemexphbs from 'nodemailer-express-handlebars';
import nodemailer from 'nodemailer';
import NswApi from './api';

// Initial data
const clientId = 'ncCUEfpAhAcJmFsq5FfmLb5Hv4wW70cq';
const clientSecret = 'An24qg07qCKpwUqG';

const stationsWhitelist = [63, 322, 327, 854, 1306, 1377];
const pricesWhitelist = ['E10', 'U91'];
const stations = {};

const Api = new NswApi(clientId, clientSecret);

Api.init((err) => {
  Api.getAllFuelPrices((err, data) => {
    if (!err) {
      // Parse stations
      data.stations.forEach((station) => {
        const stationcode = parseInt(station.code, 10);

        if (stationsWhitelist.indexOf(stationcode) > -1) {
          stations[stationcode] = station;
        }
      });

      // Parse prices
      data.prices.forEach((price) => {
        const stationcode = parseInt(price.stationcode, 10);

        if (stationsWhitelist.indexOf(stationcode) > -1 && pricesWhitelist.indexOf(price.fueltype) > -1) {
          const station = stations[stationcode];
          station.pricesOld || (station.pricesOld = {})
          station.pricesNew || (station.pricesNew = {})
          station.variance || (station.variance = {})
          station.varianceClass || (station.varianceClass = {})
          station.updated || (station.updated = false)

          station.pricesOld[price.fueltype] = price;
          station.pricesNew[price.fueltype] = price;
          station.variance[price.fueltype] = 0;
          station.varianceClass[price.fueltype] = 'muted';
        }
      });

      // console.log('initiated');
    }

    // Periodic update
    setInterval(() => {
      Api.getNewFuelPrices((err, data) => {
        if (!err) {
          // Parse stations
          data.stations.forEach((station) => {
            const stationcode = parseInt(station.code, 10);
            station.updated = false;

            if (stationsWhitelist.indexOf(stationcode) > -1) {
              !stations[stationcode] && (stations[stationcode] = station);
            }
          });

          let updated = false;

          // Parse prices
          data.prices.forEach((price) => {
            const stationcode = parseInt(price.stationcode, 10);

            if (stationsWhitelist.indexOf(stationcode) > -1 && pricesWhitelist.indexOf(price.fueltype) > -1) {
              const station = stations[stationcode];
              station.updated = true;
              updated = true;

              station.pricesOld || (station.pricesOld = {})
              station.pricesNew || (station.pricesNew = {})
              station.variance || (station.variance = {})
              station.varianceClass || (station.varianceClass = {})

              station.pricesOld[price.fueltype] = station.pricesNew[price.fueltype];
              station.pricesNew[price.fueltype] = price;
              station.variance[price.fueltype] = parseInt(station.pricesOld[price.fueltype].price, 10) - parseInt(price.price, 10);
              if (station.variance[price.fueltype] > 0) {
                station.varianceClass[price.fueltype] = 'success'
              } else if (station.variance[price.fueltype] < 0) {
                station.varianceClass[price.fueltype] = 'danger'
              }
            }
          });

          if (updated) {

            let transporter = nodemailer.createTransport({
                sendmail: true,
                newline: 'unix',
                path: '/usr/sbin/sendmail'
            });

            transporter.use('compile', nodemexphbs({ viewPath: __dirname + '/views' }));

            transporter.sendMail({
              from: 'info@example.com',
              to: 'taghvaei@live.com',
              subject: 'Fuel prices changed',
              template: 'email',
              context: {
                stations: stations
              },
            }, (err, info) => {
              // console.log(info.envelope);
              // console.log(info.messageId);
              info.message.pipe(process.stdout);
            });
          }
          // console.log('updated');
        }
      });
    }, 1000 * 60 * 20); // Every 20 minutes

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

app.listen(80, () => {
  ('Express server started on port 80'); // eslint-disable-line
});

