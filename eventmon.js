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

var evtModule = require('./eventService');
var readline = require('readline');


// --------------------------------------------------------------
//                 Application Specific Handler 
//                 of BlueJeans Events 
// --------------------------------------------------------------
var roster_names = {};
var party = [];
var pKeys = [];
var pgNum = 0;
var npp = 20;

var titleRow= 22;
var statRow = titleRow + 1;
var errRow = titleRow+2;

var colNum  = 1;
var colName = 4;
var colCnct = 30;
var colVmute = 40;
var colAmute = 50;
var colCQ  = 57;

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


function showTitle(){
    conGoto(titleRow,1,conTitle+"Events Monitor for meeting: "+ meeting_id + " (" + pKeys.length+" part" +
	         (pKeys.length < 2 ? "y)" : "ies)")+conReset);
}

function errMsg(msg){
	conGoto(errRow,1,msg+conEraEOL);
}

function statusMsg(msg){
	conGoto(statRow,1,msg);
	showTitle();
};

function conGoto(x,y,msg){
	console.log("\x1b["+x+";"+y+"H" + msg );
}


function conClrScrn(){
	conGoto(1,1,conEraEOP);
	conGoto(1,colNum,conTitle+"# ");
	conGoto(1,colName,conTitle+"Participant");
	conGoto(1,colCnct,conTitle+"Meeting");
	conGoto(1,colVmute,conTitle+"Video");
	conGoto(1,colAmute,conTitle+"Audio");
	conGoto(1,colCQ,conTitle+"Qual."+conReset);
}

function pageBounds(){
	var pSt = pgNum*npp;
    var pEnd = pSt + npp; 
	var pLen = Object.keys(party).length;
	if (pEnd > pLen) pEnd = pLen;
	return { pSt : pSt, pEnd:pEnd };
}


function showParty(E1){
	var pb = pageBounds();

	function showField(col,msg){
		conGoto(L+2,col,msg);
	}
	
	function showQuality(qs){
		var q = Number(qs);
		var qExpr = conEraEOL;
		if(q>=4){
			qExpr = "\x1b[42m\x1b[30m  " + q + conReset;
		} else if (q>=2){
			qExpr = "\x1b[43m\x1b[30m " + q + conReset + " ";
		} else {
			qExpr = "\x1b[41m\x1b[47m" + q + conReset + "  ";
		}
		return qExpr;		
	}
	
	var L = pKeys.findIndex( (cur,idx) =>{ return (E1 == cur)});
	
	if( L < pb.pSt )
		return;
	if( L >= pb.pEnd)
		return;
	
	L = L-pb.pSt;	
	showField(colNum, pgNum*npp + L);
	showField(colName,party[E1].n);
	showField(colCnct, party[E1].c  == "Join" ? party[E1].c : conFgWhite+"Left"+conReset);
	showField(colVmute,party[E1].V2 == "1" ? conReverse+"Muted"+conReset: "Video");
	showField(colAmute,party[E1].A2 == "1" ? conReverse+"Muted"+conReset: "Audio");
	showField(colCQ, showQuality(party[E1].C1));  // + ", " + Number(party[E1].C1) + "\xa6\xa6\xa6");
}



function showCurPage(){
	var p;
	var pb = pageBounds();
	
	for(p=0; p<npp; p++){
		conGoto(p+2,1,conEraEOL);
	}
	for(p=pb.pSt; p<pb.pEnd; p++){
		showParty(pKeys[p]);
	}
}

function userJoins(u){
	party[u.E1] = u;
	pKeys = Object.keys(party);
}

function userLeaves(u){
	delete party[u.E1];
	pKeys = Object.keys(party);
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
						if( !party[item.E1]) {
							var n = {
								C1 : item.C1,
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
							userJoins(n);
							// console.log("PARTICIPANT: {cur st} " + item.n + " via " + item.e + " (" + item.c + ")");
							roster_names[item.c] = item.n;
						}
                    });
					showCurPage();
                }
                // Add
                else if (eventJson.props.a)
                {
					var pst = party.length;
					
                    eventJson.props.a.forEach(function (item)
                    {
						if( !party[item.E1]) {
							//console.log("PARTICIPANT: {add}" + item.n + " via " + item.e + " (" + item.c + ")");
							var n = {
								C1 : item.C1,
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
							userJoins(n);
							roster_names[item.c] = item.n;
						}
                    });
					showCurPage();
                }
                // Delete?
                else if (eventJson.props.d)
                {
                    eventJson.props.d.forEach(function (item)
                    {
                        // console.log("LEFT MEETING: " + item.n);
						if(party[item.E1]){
							party[item.E1].c = "Left";
							// userLeaves(item);
							// delete party[item.E1];
							showParty(item.E1)
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
							party[item.E1].V2 = item.V2;
							showParty(item.E1);

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
							party[item.E1].A2 = item.A2;
							showParty(item.E1);

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
							party[item.E1].C1 = item.C1;
							showParty(item.E1);
                            //console.log("CALL QUALITY CHANGED TO " + item.C1 + " FOR " + roster_names[item.c]);
                        }

                        if (item.T)
                        {
							party[item.E1].T = item.T;
							showParty(item.E1)
							
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

var oauthRec = {
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
	var myMeetingEvents = evtModule.eventService(_, my, sockjs);
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
		myMeetingEvents.setStatusCallbacks(statusMsg,errMsg);
		myMeetingEvents.registerHandler(handler, 'meeting.register.error');   
		myMeetingEvents.registerHandler(handler, 'meeting.notification');   
	}
	showTitle();
	kp();
},function(errors){
	console.log("Error!: " + errors);
	process.exit();
});

function kp() {
	readline.emitKeypressEvents(process.stdin);
	process.stdin.setRawMode(true);	
	process.stdin.on('keypress', function (chunk, key) {
		switch(key.name)
		{
			case 'c':
				if (key.ctrl) {
					conGoto(24,1,conEraEOL + "***done***");
					process.exit();
				}
				break;
			case 'l':
				if (key.ctrl) {
					conClrScrn();
					showTitle();	
					showCurPage();
				}
				break;
			case 'pagedown':
			    pgNum ++;
				errMsg("pgNum = " + pgNum);
				showCurPage();
				break;
		    case 'pageup':
			    pgNum--;
				if(pgNum < 0) pgNum = 0;
				errMsg("pgNum = " + pgNum);
				showCurPage();
				break;
			default:
				errMsg("Unknown Key: " + JSON.stringify(key));
		}
	});
}

	
