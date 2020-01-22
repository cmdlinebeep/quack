document.addEventListener('DOMContentLoaded', function() {
    // Configuration when website loads

    // Simple script to keep my app always on!
    // Pings the app every 5 minutes
    setInterval(function() {
        const request_app = new XMLHttpRequest();
        request_app.open('GET', 'http://quack-addicts.herokuapp.com');
        request_app.send( null );   // No data to attach
        return false;
    }, 300000); // every 5 minutes (300000)

    // Set up the Sidenav elements
    const nav_elems = document.querySelectorAll('.sidenav');
    const nav_options = {
        inDuration: 350,
        outDuration: 350,
        edge: 'left'
    };
    const nav_instances = M.Sidenav.init(nav_elems, nav_options);

    // Connect to websocket (need to do first, as new user emits data to server).
    // Defaults to trying to connect to the host that serves the page.
    const socket = io.connect(location.protocol + '//' + document.domain + ':' + location.port);

    // Once connected...
    socket.on('connect', () => {
        // Put a bunch of button/form configuration into functions to keep the code clean.
        // Use configure_form_button() to configure the button
        // and then grab_form_text_and_clear() in your button's onClick()

        // Send Message button
        const send_btn = configure_form_button('message_input', 'send-button');

        // Attach an on-click event to the button here (keeps HTML cleaner)
        send_btn.onclick = () => {

            const msg_text = grab_form_text_and_clear('message_input');
            
            // Add timestamp here instead of on server.  More I can do on client the better to reduce server load.
            var timestamp = getTimeStamp();

            // Send username, message, and timestamp to server...
            socket.emit('add msg', {'channel': selected_channel, 'username': localStorage.getItem("username"), 'msg': msg_text, 'ts': timestamp, 'pm': localStorage.getItem('pm')});
        };

        // Add Channel button
        const add_channel_btn = configure_form_button('new_channel_name', 'add_channel_button');

        // Attach an on-click event to the button here (keeps HTML cleaner)
        add_channel_btn.onclick = () => {
            const new_channel = grab_form_text_and_clear('new_channel_name');
            
            // Send new channel name to the server...
            socket.emit('add channel', {'channel': new_channel, 'selected_channel': selected_channel});
        };

        // Look to see if user has been here before.  If not, pop up modal.
        if (!localStorage.getItem('username')) {
            // Set up Modals (there is only one)
            const ModalElem = document.querySelector('#modal1');
            const ModalOptions = {
                dismissible: false
            }
            const ModalInstance = M.Modal.init(ModalElem, ModalOptions);
            ModalInstance.open();

            // New Username button (inside modal)
            const username_btn = configure_form_button('username-input', 'lets-chat-btn');

            // Attach an on-click event to the button here (keeps HTML cleaner)
            username_btn.onclick = () => {
                const username = grab_form_text_and_clear('username-input');
                                
                // Save username for next time
                localStorage.setItem("username", username);

                // Send it to the server.. "emit" is non-blocking!  So need another function (add_user) to get it back from storage
                socket.emit('add user', {'username': username});
            };
        } else {
            // Tell the server we are here.  This is the last thing we do in all branches of the on.connect code!
            socket.emit('add user', {'username': localStorage.getItem('username')});
        }

    }); // end on(connect)

    
    // When server sends username back to client...
    socket.on('welcome user', function(data) {
        // Modify the DOM here to welcome user
        document.querySelector('#user-welcome').innerHTML = 'Welcome, ' + data['username'] + '!';

        // Figure out if the channel was saved from last time
        if (!localStorage.getItem('selected_channel')) {
            // No selected channel yet, set it to "general"
            selected_channel = "general";
            localStorage.setItem('selected_channel', 'general');
            // Is the selected channel a private message channel?
            localStorage.setItem('pm', 'no');
        } else {
            selected_channel = localStorage.getItem('selected_channel');
        }

        // Tell the server we are here and what channel we were last on
        socket.emit('user connected', {'username': data['username'], 'selected_channel': selected_channel, 'pm': localStorage.getItem('pm')});

    }); // end on(welcome user)


    // When server sends list of channels...
    socket.on('list channels', function(data) {
        // Manipulate the DOM to display the channels

        // We know local storage is already set
        selected_channel = localStorage.getItem('selected_channel');

        // Clear all channels first, not as worried about performance here as messages as the channel list is much shorter
        const channel_ul = document.querySelector('#channel-list');
        while (channel_ul.firstChild) {
            channel_ul.removeChild(channel_ul.firstChild);
        }
        
        // https://stackoverflow.com/questions/3010840/loop-through-an-array-in-javascript
        // Don't use "for in" (for enumeration), use "for of"
        for (channel of data['channels']) {
            // Create new item for list
            const li = document.createElement('li');

            // Add onClick link properties
            // NOTE: Had a difficult time debugging this.  You need to set a local object property on the individual element (li.chn)
            // If you don't do that, and just set 'channel': channel directly in the function, then when it actually calls the function
            // (much later when a user clicks it), it will always use the last value of for-loop variable "channel", which means it
            // always set the channel to the last one that was added.  So after loop is through, li.chn != channel.
            li.chn = channel;
            li.onclick = function() {
                // Only do this if not already the same channel, reduces data loading
                if (li.chn !== selected_channel) {
                    // Need to send the old channel (one we're changing away from) so that we can leave that room on the server
                    const old_channel = selected_channel;
                    localStorage.setItem('selected_channel', li.chn);
                    localStorage.setItem('pm', 'no');
                    socket.emit('change channel', {'channel': li.chn, 'old_channel': old_channel, 'pm': 'no', 'username': localStorage.getItem('username')});
                }
            };

            // Set the Inner HTML content.
            // Is this the currently selected channel?  If so, draw it darker
            if (channel === selected_channel) {
                li.innerHTML = '<a class="waves-effect sidenav-close grey lighten-1" href="#">#' + channel + "</a>";
            } else {
                li.innerHTML = '<a class="waves-effect sidenav-close" href="#">#' + channel + "</a>";
            }

            // Add new item to channel list
            channel_ul.append(li);            
        }

        // Similarly, add any users to the Online Users section

        // Clear all users first
        const user_ul = document.querySelector('#pm-list');
        while (user_ul.firstChild) {
            user_ul.removeChild(user_ul.firstChild);
        }

        // data['users'] is a list of online users
        // Each element looks like user = {"userchannel": "mrs-mallard", "userdisplay": "Mrs. Mallard"}
        for (user of data['users']) {
            // No hashtag on users.  Although channels technically, likely to confuse users that it's a channel *about* someone
            // <li><a class="waves-effect sidenav-close" href="javascript:void(0)">Grebe<span class="new badge" data-badge-caption="">4</span></a></li>
            // <li><a class="waves-effect sidenav-close" href="javascript:void(0)">Swan</a></li>
            // <li><a class="waves-effect sidenav-close" href="javascript:void(0)">Mrs. Mandrake</a></li>

            // Create new item for list
            const li = document.createElement('li');

            // Add onClick link properties
            // NOTE: Had a difficult time debugging this.  You need to set a local object property on the individual element (li.usr)
            // If you don't do that, and just set 'channel': channel directly in the function, then when it actually calls the function
            // (much later when a user clicks it), it will always use the last value of for-loop variable "channel", which means it
            // always set the channel to the last one that was added.  So after loop is through, li.usr != channel.
            li.usr = user['userchannel'];
            li.onclick = function() {
                // Only do this if not already the same channel, reduces data loading
                if (li.usr !== selected_channel) {
                    // Need to send the old channel (one we're changing away from) so that we can leave that room on the server
                    const old_channel = selected_channel;
                    localStorage.setItem('selected_channel', li.usr);
                    localStorage.setItem('pm', 'yes');
                    socket.emit('change channel', {'channel': li.usr, 'old_channel': old_channel, 'pm': 'yes', 'username': localStorage.getItem('username')});
                }
            };

            // Set the Inner HTML content.
            // Is this the currently selected channel?  If so, draw it darker
            if (user['userchannel'] === selected_channel) {
                li.innerHTML = '<a class="waves-effect sidenav-close grey lighten-1" href="#">' + user['userdisplay'] + '</a>';
            } else {
                // <li><a class="waves-effect sidenav-close" href="javascript:void(0)">Grebe<span class="new badge" data-badge-caption="">4</span></a></li>
                li.innerHTML = '<a class="waves-effect sidenav-close" href="#">' + user['userdisplay'] + '</a>';
            }

            // Add new item to channel list
            // Don't add it if we are that user!  Can't talk to self.
            if (user['userdisplay'] !== localStorage.getItem('username')) {
                user_ul.append(li);
            }
            
        }
      
        // Once we've changed the channel, display the messages there.  
        // Check for redraw_messages flag first, as in the case another user adds a channel, we don't want to redraw messages (they aren't sent again either).
        if (data['redraw_messages'] === "yes") {
            displayAllMessages(data, selected_channel);
        }
        
    }); // end on(list channels)


    // When server sends just a new message...
    socket.on('new msg', function(data) {
        displayNewMessage(data);
    });


    function displayAllMessages(data, channel) {
        // console.log("Selected channel is: " + selected_channel)

        // DOM identifier for message list
        const msg_ul = document.querySelector('#messages');

        // Clear all message content first.  This function only called when channel changes
        while (msg_ul.firstChild) {
            msg_ul.removeChild(msg_ul.firstChild);
        }
                
        // Already filtered down 'messages' to just be a list for this channel, not all of it.
        for (msg of data['messages']) {
            msg_ul.append(createLiFromMsg(msg));
        }

        // Scroll to bottom
        scroll_to_bottom()

    } // end displayAllMessages()


    function displayNewMessage(data) {
        // console.log("Selected channel is: " + selected_channel)

        // DOM identifier for message list
        const msg_ul = document.querySelector('#messages');

        const msg = data['msg'];
        // console.log(msg);
        
        msg_ul.append(createLiFromMsg(msg));

        // Play a sound when a new message arrives
        IMBeep();
        
        // Scroll to bottom
        scroll_to_bottom();

    } // end displayNewMessage()


    function IMBeep() {
        // var sound = document.getElementById(soundObj);
        // sound.Play();
        // https://stackoverflow.com/questions/879152/how-do-i-make-javascript-beep   Second solution.
        var snd = new Audio("data:audio/wav;base64,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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABjYXJ0AAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
        snd.play();
    }


    function configure_form_button(form_id, btn_id) {
        // This function adds properties to an input form and corresponding button that we often want to add.
        // e.g. var send_btn = configure_form_button('message_input', 'send-button');
        
        // It makes the button for the form disabled unless there is content entered.
        // It also makes the button clicked if they hit enter (rather than clicking the button)

        // Disable by default unless something typed in.
        const btn = document.querySelector('#' + btn_id);
        btn.disabled = true;

        document.querySelector('#' + form_id).onkeyup = (key) => {
            // Check if something was entered
            if (document.querySelector('#' + form_id).value.length > 0) {
                btn.disabled = false;
            } else {
                btn.disabled = true;
            }

            // Click the button also if they hit Enter (13)
            if (key.keyCode==13) {
                btn.click();
            }            
        };

        return btn;
    }


    function grab_form_text_and_clear(form_id) {
        // Gets the text value from a form and returns it.  Clears the form.  Call this in your onClick()
        // e.g. const msg_text = grab_form_text_and_clear('message_input');
        
        const msg_text = document.querySelector('#' + form_id).value;
        document.querySelector('#' + form_id).value = '';
        return msg_text;
    }


    function createLiFromMsg(msg) {
        // Create new item for message list
        const li = document.createElement('li');

        // Modify li class first (for Materialize theme)
        li.className = "collection-item avatar";

        // Add content to inner HTML
        li.innerHTML = '<i class="circle ' + getUserColor(msg[0]) + '">' + msg[0].slice(0, 1).toUpperCase() + '</i><span class="title"><b>' + msg[0] + '</b></span>' +
                        '<p>' + msg[1] + '</p><a href="#!" class="secondary-content grey-text">' + msg[2] + '</a>';
        
        return li;
    } // end createLiFromMsg()


    function scroll_to_bottom() {
        // Essentially, scrolls to the max scroll value that content would take without a scrollbars.
        // This has the effect of scrolling all the way.  :-)
        // https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollTop
        // https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollHeight

        // This needs to be the element that has scroll properties, the div not the ul
        const objDiv = document.getElementById("message_window");
        objDiv.scrollTop = objDiv.scrollHeight;
    }
    
    
    function getUserColor(username) {
        // Computes and returns a string to represent the color for the username, so that their avatar circle is consistent color
        // Client side code for performance.  Not stored on the server.  Based on the first two letters of the username.

        // This got way too complicated trying to map to base 37 (26 letters, 10 numbers, plus a hyphen) and then mapping that
        // into the 19 colors and 9 shading variations...  
        // Going to simplify.  First letter will map to color.  Second will map to shading.

        // Get first three chars and lowercase them
        let low = username.toLowerCase();
        let a = mapAscii(low.charCodeAt(0));
        let b = mapAscii(low.charCodeAt(1));
        
        // console.log(low);
        // console.log(a);
        // console.log(b);

        let col = "";
        let shade = "";

        // 37 characters maps pretty nicely to 19 colors, at about 1 color per 2 characters
        // https://materializecss.com/color.html
        switch (true) {
            case a > 36: col = "brown";         break;      // Pretty much this would never happen since username can't start with -
            case a > 34: col = "blue-grey";     break;
            case a > 32: col = "grey";          break;
            case a > 30: col = "deep-orange";   break;
            case a > 28: col = "orange";        break;
            case a > 26: col = "amber";         break;
            case a > 24: col = "yellow";        break;
            case a > 22: col = "lime";          break;
            case a > 20: col = "light-green";   break;
            case a > 18: col = "green";         break;
            case a > 16: col = "teal";          break;
            case a > 14: col = "cyan";          break;
            case a > 12: col = "light-blue";    break;
            case a > 10: col = "blue";          break;
            case a > 8:  col = "indigo";        break;
            case a > 6:  col = "deep-purple";   break;
            case a > 4:  col = "purple";        break;
            case a > 2:  col = "pink";          break;
            case a > 0:  col = "red";           break;
            default: col = "teal";   
        }

        // Modify with lightening or darkening
        // Since most users will have a letter here, need more variety to show up, so staggered the lightening and darkening
        switch (true) {
            case b > 32: shade = "darken-4";    break;
            case b > 28: shade = "lighten-4";   break;
            case b > 24: shade = "darken-3";    break;
            case b > 20: shade = "lighten-3";   break;
            case b > 16: shade = "";            break;
            case b > 12: shade = "darken-1";    break;
            case b > 8:  shade = "lighten-1";   break;
            case b > 4:  shade = "darken-2";    break;
            case b > 0:  shade = "lighten-2";   break;
            default: shade = "lighten-2";   
        }

        // console.log(col);
        // console.log(shade);
        return (col + ' ' + shade);
    }


    function mapAscii(ascii) {
        // map letters first, 0 to 25
        if (ascii >= 97 && ascii <= 122) {
            return (ascii - 97);
        }

        // map numbers next, returns 26 to 35
        if (ascii >= 48 && ascii <= 57) {
            return (ascii - 22);
        }

        // map a hyphen in username to 36
        if (ascii == 45) {
            return 36;
        }

        // Just to return something, not critical.
        return 0;
    }


    function getTimeStamp() {
        let now = new Date();
        let dateyDate = now.getFullYear()+'-'+(now.getMonth()+1)+'-'+now.getDate();
        let hr = now.getHours();
        let min = ('0' + now.getMinutes()).slice(-2);   // https://stackoverflow.com/questions/8935414/getminutes-0-9-how-to-display-two-digit-numbers
        let ampm = 'AM';
        if (hr >= 12) {
            hr = hr - 12;
            ampm = 'PM';
        }
        return (dateyDate + ' ' + hr + ':' + min + ampm);
    }

});