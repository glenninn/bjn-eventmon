# BlueJean Meeting Event Monitor

![BlueJeans](./media/927.png)



## Reference Design for Monitoring BlueJeans Meeting Events

- 11/6/2017, g1, Initial check-in

This Node JS application demonstrates how to employ the BlueJeans' Events SDK to enable an application to monitor the Video and Audio mute states for each participant in a meeting.

The meeting you wish to monitor must be scheduled without requiring an attendee passcode.  The application connects using a meeting access token obtained on behalf the organizer's id.


### To Install
1. Download the files from this git repository
2. give the command `npm install`

### To Run
The application is contained in the eventmon.js file.  It requires one parameter when launching:  the numeric ID of the BlueJeans meeting


`node eventmon numeric_id`
