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
var COGNITO_IDENTITY_POOL = '<COGNITO_IDENTITY_POOL>';
var IOT_REGION = 'us-east-1';
var IOTENDPOINT = 'data.iot.'+IOT_REGION+'.amazonaws.com';
var TOPIC = 'simpleBeerEdison';
var THINGNAME = 'simpleBeerEdison';
var SHADOWTOPIC = '$aws/things/' + THINGNAME + '/shadow/update/delta';
var APIENDPOINT = '<API ENDPOINT>';

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

var switchToInput = function () {
    var sbsID = $(this).attr('sbsID')
    var span = $(this).children("span");
    var type = $(this).attr('type');
    var id = span.attr("id");
    var $input = $("<input>", {
        val: $(span).text(),
        type: "text",
        sbsID: sbsID,
        type: type,
        old_id: id,
        id: "editInput"
    });
    $input.addClass("editInput");
    // $input.attr("old_id",id);
    $(span).replaceWith($input);
    $input.on("blur", switchToSpan);
    $input.select();
};
var switchToSpan = function () {
    var id = $(this).attr("old_id");
    var $span = $("<span>", {
        text: "",//$(this).val(),
        id: id
    });
    $span.addClass("value");
    $(this).replaceWith($span);
    $span.on("click", switchToInput);
};

// this is a test
var submitInput = function (event) {
  if(event.keyCode == 13){
    var data = {
      sbsID: this.sbsID,
      type: this.type,
      value: this.value
    };
    $.ajax({
         type: "POST",
         url: APIENDPOINT,
         data: JSON.stringify(data),
         contentType: "application/json; charset=utf-8",
         crossDomain: true,
         dataType: "json",
         success: function (data, status, jqXHR) {
             alert(success);
         },
         error: function (jqXHR, status) {
             // error handler
             console.log(jqXHR);
             alert('fail' + status.code);
         }
      });
  }
};

$(document)
    .on("click", ".editable", switchToInput )
    .on("keyup", "input", submitInput );

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
           sbsUnits[sbsID] = { 'flow': new TimeSeries(), 'sound': new TimeSeries(), 'timestamp': new Date().getTime(), 'meta': response.state.desired};
           console.log('sbsUnits[sbsID].meta:',sbsUnits[sbsID].meta)
           flow.addTimeSeries(sbsUnits[sbsID]['flow'], { strokeStyle: colorToStyle(sbsUnits[sbsID].meta.color, 1), fillStyle: colorToStyle(sbsUnits[sbsID].meta.color, 0), lineWidth: 3 });
           sound.addTimeSeries(sbsUnits[sbsID]['sound'], { strokeStyle: colorToStyle(sbsUnits[sbsID].meta.color, 1), fillStyle: colorToStyle(sbsUnits[sbsID].meta.color, 0), lineWidth: 3 });
           $('#legend').append('<div id="legend-' + sbsID + '" class="legend-row"><div class="unittype"></div>'+
                  '<div class="colorblock" style="background:'+colorToStyle(sbsUnits[sbsID].meta.color, 1)+';"><div class="short">'+sbsUnits[sbsID].meta.short+'</div></div>'+
                  '<div class="location"><span class="placeholder-title">'+sbsID+'</span>'+sbsUnits[sbsID].meta.full+'</div>'+
                  '</div></div>');
           $('#stats').append('<div id="legend-' + sbsID + '" class="legend-row"><div class="unittype"></div>'+
                  '<div class="dht"><div class="temp"><span class="placeholder-title">TEMP</span><span class="value" id="temperature-'+sbsID+'-value">0</span>°C</div>'+
                  '<div class="humidity"><span class="placeholder-title">HUMIDITY</span><span class="value" id="humidity-'+sbsID+'-value">0</span>%</div>'+
                  '<div class="beerlevel"><span class="placeholder-title">BEER LEVEL</span><div class="editable" type="beerlevel" sbsID="'+sbsID+'"><span class="value" id="beerlevel-'+sbsID+'-value">0</span>%<div class="editableIcon ion-android-create"/></div></div>'+
                  '<div class="brewery"><span class="placeholder-title">BREWERY</span><div class="editable " type="brewery" sbsID="'+sbsID+'"><span class="value" id="brewery-'+sbsID+'-value">Brewery</span><div class="editableIcon ion-android-create"/></div></div>'+
                  '<div class="beer"><span class="placeholder-title">BEER NAME</span><div class="editable" type="beername" sbsID="'+sbsID+'"><span class="value" id="beername-'+sbsID+'-value">Beer name</span><div class="editableIcon ion-android-create"/></div></div>'+
                  '</div></div>');
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
    } else {
      $('#' + type + '-'+sbsID+'-value').html(value);
    }

}

/**
 * Create a new SmootheChart object based on the defined characteristics in the CONSTANTS section.
 * @param sensor {string} Name of the sensor.
 */
function createTimeSeriesGraph(sensor) {
    var smoothie = new SmoothieChart({ millisPerPixel: MILLIS_PER_PIXEL, maxValueScale: MAX_VAL_SCALE, minValueScale: MIN_VAL_SCALE, grid: { strokeStyle: colorToStyle(colors.gray.rgb,colors.gray.alpha), fillStyle: colorToStyle(colors.gray.rgb,colors.gray.alpha), lineWidth: LINE_WIDTH, millisPerLine: MILLIS_PER_LINE, verticalSections: VERTICAL_SECTIONS } });
    smoothie.streamTo(document.getElementById(sensor), SMOOTHIE_SPEED);
    return smoothie;
}

function resizeCanvas() {
    if (document.documentElement.clientWidth < 800) var a = document.documentElement.clientWidth;
    else var a = document.documentElement.clientWidth - 600;
    var b = document.documentElement.clientHeight - document.documentElement.clientHeight / 2 - 60,
        c = document.getElementById('flow');
    c.height = b, c.width = a;
    var d = document.getElementById('sound');
    d.width = a, d.height = b

    $('.timeline-Widget').height = document.documentElement.clientHeight;
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
    console.log('requestUrl: ', requestUrl);
    console.log('client: ', client);
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

  initMqttClient(requestUrl, String(Math.random()).replace('.', ''), TOPIC + "/#",
    (message) => {
       console.log(message.payloadString);
       var record = JSON.parse(message.payloadString);

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
         console.log(message.payloadString);
         var record = JSON.parse(message.payloadString);

         if (record.state.deviceId===undefined) {
           console.log('Record format incorrect, or missing SBSID.');
         }
         async.series([
           function(callback) {
             var deviceId = record.state.deviceId;
             // Add the unit if not already being displayed.
             if (sbsUnits[deviceId]===undefined) addSBSUnit(deviceId, callback);
             else callback(null, null);
           },
           function(callback) {
             // For each shadow record, update the appropriate value.
             var data = record.state.data;
             for(var item in data) {
               update(record.state.deviceId, Math.ceil(data[item]), item);
             };
           }
         ]);
      });
}
