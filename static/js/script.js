document.addEventListener('DOMContentLoaded', function() {
    // Configuration when website loads

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

        // Scroll to bottom
        scroll_to_bottom();

    } // end displayNewMessage()


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