/**
* SIMPLE BEER SERVICE | FRONT END CODE
* This code uses AWS API Gateway to query DynamoDB and get the latest sensor data produced
* by the Simple Beer Service compute unit.

Copyright 2014-2015 Amazon.com, Inc. or its affiliates. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance with the License. A copy of the License is located at

    http://aws.amazon.com/apache2.0/

or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

Note: Other license terms may apply to certain, identified software files contained within or
distributed with the accompanying software if such terms are included in the directory containing
the accompanying software. Such other license terms will then apply in lieu of the terms of the
software license above.

* Constants to change
* -------------------------------------------------------
* COGNITO_IDENTITY_POOL: Your Cognito Identity Pool ID.
* IOT_REGION: The region where your IoT resources are.
* --------------------------------------------------------
*/

/* CONSTANTS */
// ============ CHANGE THESE VALUES BELOW =============== //
// var COGNITO_IDENTITY_POOL = 'us-east-1:71cf65e1-ca17-49f8-8061-647dc002730c';
var COGNITO_IDENTITY_POOL = 'us-east-1:20bacd1f-0e04-4b75-9b60-448d5b5e1117';
// var COGNITO_IDENTITY_POOL = 'us-west-2:706cef52-37f4-4a9c-8aea-b7ceed3e87e1';
var IOT_REGION = 'us-east-1';
// var IOT_REGION = 'us-west-2';
var IOTENDPOINT = 'data.iot.'+IOT_REGION+'.amazonaws.com';
var TOPIC = 'simpleBeerEdisonTopic';
var THINGNAME = '+'; // to support multiple sbs
var SHADOWTOPIC = '$aws/things/' + THINGNAME + '/shadow/update/documents';

// ============ REST OF CODE =============== //
var IOTENDPOINT = 'data.iot.'+IOT_REGION+'.amazonaws.com';

// Smoothie Settings
var MILLIS_PER_PIXEL = 50;
var MAX_VAL_SCALE = 3.0;
var MIN_VAL_SCALE = 3.0;
var LINE_WIDTH = 1;
var MILLIS_PER_LINE = 400;
var VERTICAL_SECTIONS = 6;
var SMOOTHIE_SPEED = 1000;

// The SBS Units that are displayed on this page.
var sbsUnits = {};
var iot;

// Smoothie Chart objects for flow and sound sensor data.
var flow = null, sound = null;

var elementCount=0;

// Default colour scheme for the smoothie graph.
var colors = {
    gray: {
      rgb: [60,60,60],
      alpha: 0
    }
};

// Current timestamp
var timestamp = new Date().getTime();
var bgToggle = 0;

/* On page load, init Smoothie graphs */
$(document).keypress(function(e) {
  if(e.ctrlKey && e.altKey && (e.charCode==47)) {
    setBackground();
  }
});

$( document ).ready(function() {

  window.addEventListener('resize', resizeCanvas, !1);
  resizeCanvas('');

  flow = createTimeSeriesGraph('flow');
  sound = createTimeSeriesGraph('sound');

  // Configure Cognito identity pool
  AWS.config.region = IOT_REGION;
  var credentials = new AWS.CognitoIdentityCredentials({
      IdentityPoolId: COGNITO_IDENTITY_POOL,
  });
  AWS.config.credentials = credentials;

  // Getting AWS creds from Cognito is async, so we need to drive the rest of the mqtt client initialization in a callback
  credentials.get(function(err) {
      if(err) {
          console.log(err);
          return;
      }
      var requestUrl = SigV4Utils.getSignedUrl('wss', IOTENDPOINT, '/mqtt',
          'iotdevicegateway', IOT_REGION,
          credentials.accessKeyId, credentials.secretAccessKey, credentials.sessionToken);
      initClient(requestUrl);
  });

});


/* FUNCTIONS */

/**
 * This function adds a new SBS unit to the SBS dictionary. It initializes the timeseries objects in each object.
 * @param {string} sbsID The identifier for the SBS unit
 * @param {Function} callback The callback funciton.
 */
 function addSBSUnit(sbsID, callback) {
     var params = {
       thingName: sbsID /* required */
     };
     var iotdata = new AWS.IotData({
       endpoint:IOTENDPOINT
     });
     iotdata.getThingShadow(params, function (err, data) {
       if (err) callback(err, null); // an error occurred
       else  {
          console.log('sbsID',sbsID);

          if (sbsUnits[sbsID]===undefined) {
           var response = JSON.parse(data.payload);
           console.log('response:',response)
           sbsUnits[sbsID] = {
             'flow': new TimeSeries(),
             'sound': new TimeSeries(),
             'timestamp': new Date().getTime(),
             'meta': response.state.desired,
             'kegdata': {}
           };
           console.log('sbsUnits[sbsID].meta:',sbsUnits[sbsID].meta)
           flow.addTimeSeries(sbsUnits[sbsID]['flow'], { strokeStyle: colorToStyle(sbsUnits[sbsID].meta.color, 1), fillStyle: colorToStyle(sbsUnits[sbsID].meta.color, 0), lineWidth: 3 });
           sound.addTimeSeries(sbsUnits[sbsID]['sound'], { strokeStyle: colorToStyle(sbsUnits[sbsID].meta.color, 1), fillStyle: colorToStyle(sbsUnits[sbsID].meta.color, 0), lineWidth: 3 });

           var meta = sbsUnits[sbsID].meta;
           var beerlevel = 0;
           try{
             beerlevel = ((meta.kegdata.size - meta.kegdata.usage) / meta.kegdata.size) * 100;;
             beerlevel = Math.ceil(beerlevel);
           } catch (e) {
             console.log(e);
           }

           if(elementCount%2==0){
            //  $('#legend').append('<div class="w-100"></div>');
           }
           $('#legend').append(
                  '<div id="legend-' + sbsID + '" class="legend-block">'+
                    '<div id="legend-row">'+
                      '<div id="colorblock" style="background:'+colorToStyle(sbsUnits[sbsID].meta.color, 1)+';">'+
                      '</div>'+
                      '<div id="legend-location">'+
                        '<div id="short">'+sbsID+'</div>'+
                        '<div id="legend-temp-humidity">'+
                          '<div id="temp"><span class="placeholder-title">TEMP</span><span class="value"><div id="temperature-'+sbsID+'-value">0</div>°C</span></div>'+
                          '<div id="humidity"><span class="placeholder-title">HUMIDITY</span><span class="value"><div id="humidity-'+sbsID+'-value">0</div>%</span></div>'+
                        '</div>'+
                      '</div>'+
                      '<div id="dht">'+
                        '<div id="description-row">'+
                          '<div id="beer-logo"><img class="beer-logo" id="beerlogo-'+sbsID+'-value" src="'+sbsUnits[sbsID].meta.kegdata.logo+'"></img></div>'+
                          '<div id="beer-brewery">'+
                            '<div id="beer"><span class="placeholder-title">BEER NAME</span><span class="value" id="beername-'+sbsID+'-value">'+sbsUnits[sbsID].meta.kegdata.name+'</span></div>'+
                            // '<div class="location"><img class="country-flag" src="http://www.geonames.org/flags/x/'+sbsUnits[sbsID].meta.location.toLowerCase()+'.gif"/></div>'+
                            '<div id="brewery"><span class="placeholder-title">BREWERY</span><span class="value" id="brewery-'+sbsID+'-value">'+sbsUnits[sbsID].meta.kegdata.brewery+'</span></div>'+
                          '</div>' +
                        '</div>'+
                        '<div id="beerlevel"><span class="placeholder-title">BEER LEVEL</span>'+
                          '<div id="progress">' +
                            '<div id="beerlevel-'+sbsID+'-value" role="progressbar" aria-valuenow="'+beerlevel+'" aria-valuemin="0" aria-valuemax="100" style="width:'+beerlevel+'%;background-color:'+colorToStyle(sbsUnits[sbsID].meta.color, 1)+'">'+
                            '</div>' +
                          '</div>' +
                          '<span id="beerlevel-label-'+sbsID+'-value">' + beerlevel+'% beer left</span>'+
                        '</div>'+
                      '</div>'+
                    '</div>'+
                  '</div>');
            elementCount++;
            callback(null, null);
          }
        }
     });
 }

/**
 * Converts an RBG color array [R,G,B] to a css style.
 */
function colorToStyle(color, alpha) {
   return 'rgba(' + color[0] + ',' + color[1] + ',' + color[2] + ','+alpha+')';
}

/**
 * Updates the Smoothie graph with the latest timeseries data.
 * @param {string} sbsID The identifier for the SBS unit
 * @param {JSON} values The values returned from the API Gateway request.
 */
function update(sbsID, value, type) {
    type = type.toLowerCase();

    if (value===undefined||type===undefined) {
      console.error('No data.');
      return;
    }

    if (type==='sound'||type==='flow') {
      sbsUnits[sbsID][type].append(Date.now(), value);
    // } else if (type==='size' || type ==='usage') {
    } else if (type==='kegdata') {
      // debugger;
      sbsUnits[sbsID]['kegdata'] = value;

      var size = sbsUnits[sbsID]['kegdata']['size'];
      var usage = sbsUnits[sbsID]['kegdata']['usage'];

      console.log('size:', size, ',usage:', usage);

      var beerlevel = 0;

      try{
        beerlevel = ((size - usage) / size) * 100;;
        beerlevel = Math.ceil(beerlevel);
      } catch (e) {
        console.log(e);
      }
      console.log(beerlevel);
      $('#beerlevel' + '-'+sbsID+'-value').attr('aria-valuenow',beerlevel);
      $('#beerlevel' + '-'+sbsID+'-value').width(beerlevel + '%');
      $('#beerlevel-label' + '-'+sbsID+'-value').html(beerlevel + '% beer left');

      $('#' + 'beerlogo' + '-' + sbsID + '-value').attr('src',sbsUnits[sbsID]['kegdata']['logo']);
      $('#' + 'beername' + '-' + sbsID + '-value').html(sbsUnits[sbsID]['kegdata']['name']);
      $('#' + 'brewery' + '-' + sbsID + '-value').html(sbsUnits[sbsID]['kegdata']['brewery']);

    } else {
      $('#' + type + '-'+sbsID+'-value').html(value);
    }

}

/**
 * Create a new SmootheChart object based on the defined characteristics in the CONSTANTS section.
 * @param sensor {string} Name of the sensor.
 */
  function createTimeSeriesGraph(sensor) {
    var smoothie = new SmoothieChart({
      millisPerPixel: MILLIS_PER_PIXEL,
      maxValueScale: MAX_VAL_SCALE,
      minValueScale: MIN_VAL_SCALE,
      // responsive: true, // this slows down Chrome
      grid: {
        strokeStyle: colorToStyle(colors.gray.rgb,colors.gray.alpha),
        fillStyle: colorToStyle(colors.gray.rgb,colors.gray.alpha),
        lineWidth: LINE_WIDTH,
        millisPerLine: MILLIS_PER_LINE,
        verticalSections: VERTICAL_SECTIONS
      } });

    smoothie.streamTo(document.getElementById(sensor), SMOOTHIE_SPEED);
    return smoothie;
}

function resizeCanvas() {

    var rightPanelHeight = $('#navbar').position().top;
    var legendExpectedHeight = rightPanelHeight * 0.6;

    var graphPanelHeight = rightPanelHeight - legendExpectedHeight;

    var windowsWidth = window.innerWidth;
    var rightPanelMargin = 50;

    if(windowsWidth>576){

      $('#legend').css('min-height', function(){
        return legendExpectedHeight;
      });

      var leftPanelWidth = $('#left-panel').innerWidth();
      var rightPanelWidth = windowsWidth - leftPanelWidth - rightPanelMargin;

      var canvasWidth = rightPanelWidth/2;

      $('#flow').attr('width', canvasWidth);
      $('#sound').attr('width', canvasWidth);

      var h1Height = $('#flow-h1').outerHeight(true);
      var canvasHeight = graphPanelHeight - h1Height;

      $('#flow').attr('height', canvasHeight);
      $('#sound').attr('height', canvasHeight);

      console.log(canvasWidth, canvasHeight);

    } else {

      $('#legend').css('min-height', function(){
        return 0;
      });

      var rightPanelWidth = windowsWidth - rightPanelMargin;
      var canvasWidth = rightPanelWidth;

      $('#flow').attr('width', canvasWidth);
      $('#sound').attr('width', canvasWidth);

      var h1Height = $('#flow-h1').outerHeight(true);
      var canvasHeight = graphPanelHeight/2 - h1Height;

      $('#flow').attr('height', canvasHeight);
      $('#sound').attr('height', canvasHeight);

      console.log(canvasWidth, canvasHeight);

    }

    $('#twtimeline').attr('height', $(window).height() - $('#logo-title').height());
}

function setBackground() {
    switch ($('body').removeClass(), bgToggle) {
        case 1:
            $('body').addClass('sfo'), $('.acronym').html('SFO');
            break;
        case 2:
            $('body').addClass('nyc'), $('.acronym').html('NYC');
            break;
        default:
            bgToggle = 0, $('body').addClass('sbs'), $('.acronym').html('SBS')
    }
    bgToggle++
}

const initMqttClient = (requestUrl, clientId, topic, onMessageArrivedCallback ) => {

    var client = new Paho.MQTT.Client(requestUrl, clientId);
    // console.log('requestUrl: ', requestUrl);
    // console.log('client: ', client);
    var connectOptions = {
        onSuccess: function () {
            console.log('connected and listening to ', topic);
            client.subscribe(topic);
        },
        useSSL: true,
        timeout: 16,
        mqttVersion: 4,
        onFailure: function () {
            console.error('connect failed');
        }
    };

    client.onMessageArrived = onMessageArrivedCallback;

    client.onConnectionLost = function (message) {
        console.log('connection lost!');
        console.log(message);
    };

    client.connect(connectOptions);
};

function initClient(requestUrl) {

  initMqttClient(requestUrl, String(Math.random()).replace('.', ''), TOPIC + '/#',
    (message) => {
      //  console.log(message.payloadString);
       var record = JSON.parse(message.payloadString);
      //  console.log("record:",record);
       if (record.deviceId===undefined) {
         console.log('Record format incorrect, or missing SBSID.');
       }
       async.series([
         function(callback) {
           // Add the unit if not already being displayed.
           if (sbsUnits[record.deviceId]===undefined) addSBSUnit(record.deviceId, callback);
           else callback(null, null);
         },
         function(callback) {
           // For each data record, update the appropriate value.
           record.data.forEach(function(item) {
             update(record.deviceId, Math.ceil(item.value), item.type);
           });
         }
       ]);
    });

    initMqttClient(requestUrl, String(Math.random()).replace('.', ''), SHADOWTOPIC,
      (message) => {
        // debugger;
         console.log(message.payloadString);
         var record = JSON.parse(message.payloadString);

         var deviceId = record.current.state.reported.config.thingName;

         if (deviceId===undefined) {
           console.log('Record format incorrect, or missing SBSID.');
         }
         async.series([
           function(callback) {
            //  debugger;
            //  var deviceId = record.current.state.desired.deviceId;
             // Add the unit if not already being displayed.
             if (sbsUnits[deviceId]===undefined) addSBSUnit(deviceId, callback);
             else callback(null, null);
           },
           function(callback) {
             // For each shadow record, update the appropriate value.
             var data = record.current.state.reported.kegdata;
             update(deviceId,data,'kegdata');
            //  for(var item in data) {
            //     update(deviceId, Math.ceil(data[item]), item);
            //  };
           }
         ]);
      });
}
