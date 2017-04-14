require('babel-core/register');
require('./src/server');

// Keep app alive
var http = require('http');
setInterval(function() {
    http.get('https://fuelcomp.herokuapp.com/');
}, 300000); // every 5 minutes (300000)
