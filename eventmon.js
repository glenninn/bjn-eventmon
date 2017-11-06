var auth = require("./auth.js");

// --------------------------------------------------------------
// ------------ Handle Command Line Interactions ----------------
if (process.argv.length != 3)
{
    console.log('Usage: node eventmon.js <numeric_meeting_id>');
	console.log("Utility application to monitor events from a BlueJeans meeting");
	console.log(" Where the command line parameters are:");
	console.log("    numeric_meeting_id --- the string value you enter when joining from a client");
    process.exit(1);
}
var meeting_id = process.argv[2];



// --------------------------------------------------------------
// ----------- Load Open Source Libraries -----------------------
var _ = require('underscore');
var my = require('myclass');
var sockjs = require('sockjs-client');


// --------------------------------------------------------------
//       The BlueJeans Event Handler Object
// --------------------------------------------------------------

function eventService(_, my, sockjs)
{
    var invokeIfImplemented = function(collection, methodName, arg)
    {
        return _.invoke(_.filter(collection, function (item)
        {
            return item[methodName] !== undefined;
        }), methodName, arg);
    };

    var EventService = my.Class(
    {
        events: function()
        {
            return {
                "guid_assigned": this.guidAssigned,
                "remoteclose": this.remoteclose,
                "pairingError": this.pairingError,
                "kicked": this.kicked
            };
        },

        maxReconnects: 10,

        reconnects: 0,

        reconnectBackoff: 1000,

        constructor: function()
        {
            this.handlers = {};
        },

        registerHandler: function(handler, namespace, customOpts)
        {
            this.handlers[namespace] = handler;
        },

        setUpSocket: function(options, reconnect_count)
        {
            var self = this;
            var sock_url = options.eventServiceUrl || '';

            if (self.sock)
            {
                delete self.connected;
                if (self.joinTimeout)
                {
                    clearTimeout(self.joinTimeout);
                    delete self.joinTimeout;
                }

                self.sock.onclose = function()
                {
                    // Dummy function to avoid reconnect in the onclose method
                    // of previous socket connection.
                };
            }

            self.close(); //prevent multiple connections

            self.options = options;
            self.meetingAccessToken = options.access_token;

            var sockjs_protocols = [
                    'websocket', 'xdr-streaming', 'xhr-streaming',
                    'xdr-polling', 'xhr-polling', 'iframe-xhr-polling',
                    'jsonp-polling'
            ];
            
            var sock = self.sock = new sockjs(sock_url, {},
            {
                cookie: true,
                transports: sockjs_protocols
            });

            if (self.joinTimeout)
            {
                clearTimeout(self.joinTimeout);
                delete self.joinTimeout;
            }

            sock.onopen = function()
            {
                sock._selfclosed = false;
                sock._remoteclosed = false;

                if(self._crashed){
                    sock.close();
                    return;
                }
                 
                options.events = ['meeting', 'endpoint'];
                self.sendEvent('meeting.register', options);
                invokeIfImplemented(_.values(self.handlers), "onOpen", self.meetingAccessToken);
                self.reconnects = 0;
                if (reconnect_count && reconnect_count > 0)
                {
                    //window.Notifications.trigger('socket:reconnected');
                }

                self.joinTimeout = setTimeout(function()
                {
                   if(!self.connected)
                   {
                       self.sock.close();
                   }
                   delete self.joinTimeout;
                },10000);
            };

            sock.onmessage = function(_e)
            {
				var msg;
				try{
					msg = JSON.parse(_e.data);
				} catch(e) {
					conGoto(1,1,"Parse error");
				}
              //  try
                {
                    if ((msg.length == 2) && (typeof msg[1] === 'object'))
                    {
                        var evt = msg[0];
						conGoto(15,1,evt+ conEraEOL);
                        switch(evt)
                        {
                            case 'keepalive':
                                self.sendEvent("heartbeat");
                                break;
                            default:
                              var evt_data = msg[1];
                              if(evt_data && evt_data.reqId && self.reqCallbacks[evt_data.reqId])
                              {
                                var cb = self.reqCallbacks[evt_data.reqId];
                                delete self.reqCallbacks[evt_data.reqId];
                                cb(evt_data.error,evt_data.data);
                                break;
                              }

                              var protocolEvent = evt.match("([^.]*)$")[0];
							  
                              if (protocolEvent in self.events())
                              {
                                  //self.events()[protocolEvent](evt_data);
                                  var c = self.events()[protocolEvent];
                                  c.call(self, evt_data);
                              }
                              else
                              {
                                  var namespaces = _.keys(self.handlers);
                                  var eventNamespace = _.find(namespaces, function (namespace)
                                  {
                                      return evt.match("^"+namespace);
                                  });

                                  self.handlers[eventNamespace].onMessage(evt, evt_data);
                              }

                              break;
                        }
                    }
                    else
                    {
                        errMsg("JSON Received but not valid event: " + (msg[0] || ""));
                    }
                }
               /* catch (e)
                {
                    // console.log("ERROR: " + e)
                    //invalid json, discarding
                    errMsg("Error: Invalid JSON from SockJS - " + JSON.stringify(e));
                }*/
            };

            sock.onclose = function()
            {
                delete self.connected;

                if (self.joinTimeout)
                {
                    clearTimeout(self.joinTimeout);
                    delete self.joinTimeout;
                }
                if (
                    !self.sock._selfclosed &&
                    !self.sock._remoteclosed &&
                    !self._crashed &&

                    !self._timeoutClosed &&
                    !self._kicked

                    ) {
                    invokeIfImplemented(_.values(self.handlers), "onClosedUnexpectedly", {});
                    self.reconnect();
                }
                else
                {
                    invokeIfImplemented(_.values(self.handlers), "onClose", {});
                    //window.Notifications.trigger('socket:closed');
                }
                //Logger.warn("SockJS connection closed");
            };
            sock.onerror = function(e) {
                //Logger.warn("SockJS error occured");
                invokeIfImplemented(_.values(self.handlers), "onError", {});
            };
        },
		
        guidAssigned: function(event)
        {
            // console.log("Connected to event service. Endpoint guid: " + event.seamGuid + ", chat guid: " + event.guid);
			conGoto(statRow1,1,conReset+"(Evt Svc: connected) Endpt guid: " + event.seamGuid );
			
            this.connected = true;
            //cofa.skinny.instances.selfParticipant.set({id: event.seamGuid});
            //invokeIfImplemented(_.values(this.handlers), "onConnect");
            //window.Notifications.trigger('socket:connected');
        },

        close: function()
        {
            this.connected = false;
            if (this.sock)
            {
                invokeIfImplemented(_.values(this.handlers), "onClose", {});
                //Logger.info("Closing SockJS connection");
                this.sock._selfclosed = true;
                this.sock.close();
            }
        },

        reconnect: function()
        {
            errMsg("Reconnect!")
            var self = this;
            this.connected = false;
            if (self.sock._remoteclosed) return;
            if (self.sock._kicked) return;
            if (self._timeoutClosed) return;
            if (self.reconnects < self.maxReconnects && self.meetingAccessToken && !self._reconnecting)
            {
                //window.Notifications.trigger('socket:reconnecting');
                self._reconnecting = true;
                setTimeout(function()
                {
                    errMsg("Reconnecting");
                    self.setUpSocket(self.options, self.reconnects);
                    self._reconnecting = false;
                    self.reconnects++;
                }, self.reconnectBackoff * (self.reconnects > 10 ? 10 : self.reconnects));
            }
        },

        remoteclose: function()
        {
            errMsg("remote close")
            var self = this;
            self.sock._remoteclosed = true;
            invokeIfImplemented(_.values(self.handlers), "remoteclose");
        },

        pairingError: function(error)
        {
            var self = this;
            errMsg("Error Pairing Meeting: "+ JSON.stringify(error));
            setTimeout(function()
            {
                self.sock.close();
            }, 200);
        },

        isDisconnected: function()
        {
            return !this.isConnected();
        },

        isConnected: function()
        {
            return this.sock && this.connected;
        },

        isJoinEvent: function(eventName)
        {
            return eventName === 'meeting.register';
        },

        sendEvent: function(event_name, event_data)
        {
            if (event_name === 'heartbeat' || this.isJoinEvent(event_name) || this.isConnected())
            {
                this.sock.send(JSON.stringify([event_name, event_data || {}]));
            }
            else
            {
                errMsg("Cant send event yet -- sock or guid not ready");
            }
        },

        sendRequest: function(event_name, event_data, callback)
        {
          if(this.isConnected())
          {
            if(!this.reqId)
            {
              this.reqId = 1;
            }
            else 
            {
              this.reqId++;
            }
            if(!this.reqCallbacks)
            {
              this.reqCallbacks = {};
            }
            this.reqCallbacks[this.reqId] = callback;
            this.sock.send(JSON.stringify([event_name, {reqId: this.reqId, data: (event_data || {})}]));
          } else {
            callback({error: {message: "Sending request while not connected."}});
          }
        },

        kicked: function(event)
        {
            errMsg("Kicked");
            this.sock._remoteclosed = true;
            this.sock._kicked = true;
            this.sock.close();
        },

        crashed: function()
        {
            errMsg("Crashed");
            this._crashed = true;
            this._idleTimeout();
        }
    });

    return new EventService();
}



// --------------------------------------------------------------
//                 Application Specific Handler 
//                 of BlueJeans Events 
// --------------------------------------------------------------
var roster_names = {};
var party = [];


var statRow = 23;
var statRow1 = statRow + 1;
var errRow = statRow+2;

var colName = 1;
var colCnct = 30;
var colVmute = 40;
var colAmute = 50;


var conReset = "\x1b[0m";
var conBright = "\x1b[1m";
var conDim = "\x1b[2m";
var conUnderscore = "\x1b[4m";
var conBlink = "\x1b[5m";
var conReverse = "\x1b[7m";
var conHidden = "\x1b[8m";
var conBgYellow = "\x1b[43m";
var conFgWhite = "\x1b[37m";
var conTitle = "\x1b[37;44m";
var conEraEOP= "\x1b[J";
var conEraEOL = "\x1b[K";



function errMsg(msg){
	conGoto(errRow,1,msg);
}

function conGoto(x,y,msg){
	console.log("\x1b["+x+";"+y+"H" + msg );
}

function conClrScrn(){
	conGoto(1,1,conEraEOP);
	conGoto(1,colName,conTitle+"Name");
	conGoto(1,colCnct,conTitle+"Meeting");
	conGoto(1,colVmute,conTitle+"Video");
	conGoto(1,colAmute,conTitle+"Audio"+conReset);
}

function showField(E1,col,msg){
var p;
	for(p=0; p<party.length; p++){
		if(party[p].E1 == E1){
			conGoto(p+2,col,msg);
		}
	}
}

function showParty(p){
	var E1 = party[p].E1;
	showField(E1,colName,party[p].n);
	showField(E1,colCnct, party[p].c  == "Join" ? party[p].c : conFgWhite+"Left"+conReset);
	showField(E1,colVmute,party[p].V2 == "1" ? conReverse+"Muted"+conReset: "Video");
	showField(E1,colAmute,party[p].A2 == "1" ? conReverse+"Muted"+conReset: "Audio");
}


var handler =
{
    onMessage: function(event, eventData)
    {
        if (event === 'meeting.register.error')
        {
            errMsg('Authentication Error: You probably have a bad access token or the meeting does not exist.');
            process.exit(1);
            return;
        }

        var self = this;
        var eventJson = JSON.parse(eventData.body);
        var eventType = eventJson.event;

        // console.log("+++ HANDLER " + eventType + ": " + JSON.stringify(eventJson));
        // console.log("");

        if (eventType.startsWith('statechange.livemeeting'))
        {
			/*
            console.log('MEETING ' + eventJson.props.meetingId + ": " +  eventJson.props.audioEndpointCount + " on audio and " + eventJson.props.videoEndpointCount + " on video");
            console.log('MEETING ' + eventJson.props.meetingId + ": locked = " + eventJson.props.locked);
            console.log('MEETING ' + eventJson.props.meetingId + ": status = " + eventJson.props.status);
			*/
        }
        else if (eventType.startsWith('statechange.endpoints'))
        {
            if (eventJson.props)
            {
                // Current state
                if (eventJson.props.f)
                {
                    eventJson.props.f.forEach(function (item)
                    {
						var dupe = false;
						for(var i=0; i<party.length; i++){
							if(party[i].E1 == item.E1){
								dupe = true;
								break;
							}
						}
						if(!dupe){
							var n = {
								n  : item.n,
								E1 : item.E1,
								A1 : item.A1,
								A2 : item.A2,
								A3 : item.A3,
								V1 : item.V1,
								V2 : item.V2,
								V3 : item.V3,
								T  : item.T,
								c  : "Join"
							};
							party.push(n);
							// console.log("PARTICIPANT: {cur st} " + item.n + " via " + item.e + " (" + item.c + ")");
							roster_names[item.c] = item.n;
						}
                    });
					for(var p=0; p<party.length; p++){
						showParty(p);
					}
                }
                // Add
                else if (eventJson.props.a)
                {
					var pst = party.length;
					
                    eventJson.props.a.forEach(function (item)
                    {
						var dupe = false;
						for(var i=0; i<party.length; i++){
							if(party[i].E1 == item.E1){
								dupe = true;
								break;
							}
						}
						if(!dupe){
							//console.log("PARTICIPANT: {add}" + item.n + " via " + item.e + " (" + item.c + ")");
							var n = {
								n  : item.n,
								E1 : item.E1,
								A1 : item.A1,
								A2 : item.A2,
								A3 : item.A3,
								V1 : item.V1,
								V2 : item.V2,
								V3 : item.V3,
								T  : 0,
								c  : "Join"
							};
							party.push(n);
							roster_names[item.c] = item.n;
						}
                    });
					for(var p=0; p < party.length; p++){
						showParty(p);
					}
                }
                // Delete?
                else if (eventJson.props.d)
                {
                    eventJson.props.d.forEach(function (item)
                    {
                        // console.log("LEFT MEETING: " + item.n);
						for(var p =0; p<party.length; p++){
							if(party[p].E1 === item.E1){
								party[p].c = "Left";
								showParty(p);
								break;
							}
						}
                    });
                }
                // Modify?
                else if (eventJson.props.m)
                {
                    eventJson.props.m.forEach(function (item)
                    {
                        if (item.V2)
                        {
							for(var p=0; p<party.length; p++){
								if(party[p].E1 == item.E1){
									party[p].V2 = item.V2;
									showParty(p);
									break;
								}
							}

                            if (item.V2 == '1')
                            {
                                //console.log("VIDEO MUTE IS ON FOR " + roster_names[item.c]);
                            }
                            else if (item.V2 == '0')
                            {
                                //console.log("VIDEO MUTE IS OFF FOR " + roster_names[item.c]);
                            }
                        }

                        if (item.V8 && item.V9)
                        {
                            //console.log("VIDEO SEND SIZE IS " + item.V9 + "x" + item.V8 + " FOR " + roster_names[item.c]);
                        }

                        if (item.V5 && item.V6)
                        {
                            //console.log("VIDEO RECV SIZE IS " + item.V6 + "x" + item.V5 + " FOR " + roster_names[item.c]);
                        }

                        if (item.A2)
                        {
							for(var p=0; p<party.length; p++){
								if(party[p].E1 == item.E1){
									party[p].A2 = item.A2;
									showParty(p);
									break;
								}
							}

                            if (item.A2 == '1')
                            {
                                //console.log("AUDIO MUTE IS ON FOR " + roster_names[item.c]);
                            }
                            else if (item.A2 == '0')
                            {
                                //console.log("AUDIO MUTE IS OFF FOR " + roster_names[item.c]);
                            }
                        }

                        if (item.C1)
                        {
                            //console.log("CALL QUALITY CHANGED TO " + item.C1 + " FOR " + roster_names[item.c]);
                        }

                        if (item.T)
                        {
							for(var p=0; p<party.length; p++){
								if(party[p].E1 == item.E1){
									party[p].T = item.T;
									break;
								}
							}
							
                            if (item.T == '1')
                            {
                                //console.log("TALKING YES FOR " + roster_names[item.c]);
                            }
                            else if (item.T == '0')
                            {
                                //console.log("TALKING NO FOR " + roster_names[item.c]);
                            }
                        }
                    });
                }
            }
        }
    }
};

var 
 oauthRec = {
	 grant_type :"meeting_passcode",
	 meetingNumericId : meeting_id,
	 meetingPasscode : ""
 };
var uri = "api.bluejeans.com";
var authPath = "/oauth2/token?meeting_passcode";

auth.post( uri, authPath,oauthRec).then(function(results){
	conClrScrn();
	var access_token = results.access_token;
	var fields = results.scope.meeting.meetingUri.split("/");
	var partition = results.scope.partitionName;
	var user_id = fields[3];
	// console.log("Owner, mtg Id, token: " + user_id + ", " + meeting_id + ", " + access_token);
	// process.exit();

	// --------------------------------------------------------------
	// 				Instantiation of My Event Handler
	// --------------------------------------------------------------
	var myMeetingEvents = eventService(_, my, sockjs);
	if (myMeetingEvents)
	{
		 var opts =
		 {
			'numeric_id': meeting_id,
			'access_token': access_token,
			'user' : {
				'full_name': '',
				'is_leader': true
			},
			'leader_id': user_id,
			'protocol': '2',
			'endpointType': 'commandCenter',
			'eventServiceUrl': 'https://bluejeans.com/' + partition + '/evt/v1/' + meeting_id
		};

		myMeetingEvents.setUpSocket(opts);
		myMeetingEvents.registerHandler(handler, 'meeting.register.error');   
		myMeetingEvents.registerHandler(handler, 'meeting.notification');   
	}
    conGoto(statRow,1,conReset+"Events Monitor for meeting: "+ meeting_id);

},function(errors){
	console.log("Error!: " + errors);
	process.exit();
});
