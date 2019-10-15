import os, re
# import requests

from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room, rooms

app = Flask(__name__)
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY")
socketio = SocketIO(app)

debug = True
room_message_limit = 100

# List of channels, users can add to this
channels = ["general"]

# List of dictionary objects.  
# Each element looks like {"userchannel": "mrs-mallard", "userdisplay": "Mrs. Mallard"}
users = []

# Session ID for each new user
user_sid = {}

# Like the messages object, but keys are the private message room names
private_messages = {}

# Messages are stored in a room dictionary as lists of lists, where lists are in time sorted order and each sublist contains the username, message itself, and timestamp
if debug:
    # Add some default text for testing
    messages = {
                "general": [ ["Doge", "Much general.", "2019-9-25 1:30PM"], ["Zeke", "What socket.", "2019-9-25 1:32PM"], ["Sally", "So not REST.", "2019-9-25 11:30AM"], ["Doge", "Such emitting.", "2019-9-25 11:33PM"] ]
                }
    
    # Add a room with 98 messages for testing the 100 message limit
    # And add an empty list for messages there
    channels.append("test100")
    messages["test100"] = []

    for i in range(98):     # counts 0 to 97
        messages["test100"].append(["Robby Robot", "Message #" + str(i+1) + "!", "11010-1-1 01:10PM"])

else:
    messages = {}


def sanitize_channel_name(channel):
    # e.g. Mrs. Mallard --> mrs-mallard

    # First strip everything EXCEPT alphanumeric (non-international for now) BUT LEAVE SPACES!
    # Spaces tell us where dashes should go so don't want to remove them yet.
    has_spaces = re.sub(r'[^a-zA-Z0-9 ]+','', channel)

    # Split out any remaining spaces and join with hyphens
    hyphenated = '-'.join(has_spaces.split())

    # Finally, lowercase everything
    lower = hyphenated.lower()

    return lower


def find_pm_room(first, second):
    # Look for existing keys in the private_messages dictionary (where we store PMs).  Don't want a room called mrs-mandrake-bob and 
    # another called bob-mrs-mandrake, so need to search and use existing one (if already exists).
    
    # NOTE: Make sure you are calling sanitize_channel_name() on the *username* when you call this.  Or you'll search: Joel instead of joel
    pmr = None
    for key in private_messages.keys():
        if first in key:
            if second in key:
                # Both users already have a private room, use that key!
                pmr = key       # pm_room = bob-mrs-mandrake
                break
    return pmr


@app.route("/")
def index():
    return render_template('index.html')


@socketio.on('add user')
def add_user(data):
    # print('in: add user')
    
    # Add user to list
    # Each element looks like {"userchannel": "mrs-mallard", "userdisplay": "Mrs. Mallard"}
    username = data['username']
    # print(username)

    # Only append if not already in there.  Since list of dictionaries, search is more elaborate
    in_there = False
    for user in users:
        if username == user['userdisplay']:
            in_there = True
            break

    if not in_there:
        users.append({"userchannel": sanitize_channel_name(username), "userdisplay": username})

        # Store the SID so we can pop off a username easily
        user_sid[request.sid] = username   # Flask gives you a SID automatically

    # print(users)
    # print(user_sid)
    emit("welcome user", {"username": username})
    

@socketio.on('user connected')
def user_connected(data):
    # print('in: user connected')
    # print(f"{data['username']} on channel {data['selected_channel']}")
    # print(users)

    # Was last in a private message room, rejoin it
    if data['pm'] == 'yes':
        client = sanitize_channel_name(data['username'])    # Client we are speaking with, e.g. mrs-mandrake
        second_party = data['selected_channel']                      # Channel names are already sanitized versions, e.g. bob

        pm_room = find_pm_room(client, second_party)

        # This shouldn't happen since on first touch we go to "general", so private room should always exist already here upon user connection.
        if not pm_room:
            # No existing room was found, so no messages between these users exist yet
            # Need to create the room key, and initialize some blank content (no messages yet)
            pm_room = client + '-' + second_party
            private_messages[pm_room] = []
        
        # Room is created (or already found) at this point.  Join the room.
        join_room(pm_room)
        
        # print(f'{data["username"]} joined {pm_room}')
        # We don't want to broadcast here, or if we do, we leak messages to everyone!  We just want to redraw the messages for the user that joined.
        emit("list channels", {"channels": channels, "messages": private_messages[pm_room], "redraw_messages": "yes", "users": users})

    # Not a private room
    else:
        # Upon connection, need to join a room first
        join_room(data['selected_channel'])

        # Send user the list of channels available, as well as the selected channel
        # Need to redraw the messages in case they left the site then came back
        # Same, we don't want to broadcast or we redraw for everyone the messages even in a public channel, aren't the right channel!
        emit("list channels", {"channels": channels, "messages": messages[data['selected_channel']], "redraw_messages": "yes", "users": users})

    # And now for both cases...
    # Yet we still do need to broadcast to everyone that a user has joined.  The solution is just another emit event.
    # This time we broadcast to everybody, but we don't redraw the messages.
    emit("list channels", {"channels": channels, "messages": [], "redraw_messages": "no", "users": users}, broadcast=True)


@socketio.on('add channel')
def add_channel(data):
    # Add channel to list, after sanitizing and checking for duplicates

    # Sanitize new channel name first
    sanitized = sanitize_channel_name(data['channel'])

    # Don't add channel if it already exists.  Uses lists, not sets, because do actually care about order rooms were added.
    if sanitized not in channels:
        # Add new channel to channel list
        channels.append(sanitized)

        # Create empty channel content and add to messages
        messages[sanitized] = []

        # emit("list channels", {"channels": channels, "messages": [], "selected_channel": selected, "redraw_messages": "no"}, broadcast=True)
        emit("list channels", {"channels": channels, "messages": [], "redraw_messages": "no", "users": users}, broadcast=True)


@socketio.on('change channel')
def change_channel(data):
    # Although we could know the old channel, we don't know if the old channel was a PM selection or not too (code becomes too complex to track
    # so many variables).  Since in our application we can only be in one room at time, just leave all rooms except the .sid one.
    # Leave the old channel both assuming it wasn't a PM channel, and also assuming it was.  leave_room is safe for bad keys.
    leave_room(data['old_channel'])
    old_pm_room = find_pm_room(sanitize_channel_name(data['username']), data['old_channel'])
    if old_pm_room is not None:
        leave_room(old_pm_room)

    # If not a private message, stick to old behavior
    if data['pm'] == 'no':
        # Leave the old room.  If we don't "leave the room" then like we're subscribed to many rooms (have many ears in many rooms :-)
        # And so we continue to get messages from other rooms than the one we're displaying.
        # leave_room(data['old_channel'])
        
        # Join the new room
        room = data['channel']
        join_room(room)
        
        # print(f'{data["username"]} left {data["old_channel"]} and joined {room}')
        # print(f'rooms: {rooms()}')

        # Send back channels to client.  Need to do this to update the "selected" channel tab
        # Only send back the messages for this channel!  Much less data to send that way.
        emit("list channels", {"channels": channels, "messages": messages[room], "redraw_messages": "yes", "users": users})

    else:
        # Private Message
        
        # Join new room
        # First we have to see if a private room exists between these two people (username of client, and username of channel they clicked)
        client = sanitize_channel_name(data['username'])    # Client we are speaking with, e.g. mrs-mandrake
        second_party = data['channel']                      # Channel names are already sanitized versions, e.g. bob

        pm_room = find_pm_room(client, second_party)

        if not pm_room:
            # No existing room was found, so no messages between these users exist yet
            # Need to create the room key, and initialize some blank content (no messages yet)
            pm_room = client + '-' + second_party
            private_messages[pm_room] = []
        
        # Room is created (or already found) at this point.  Join the room.
        join_room(pm_room)
        
        # print(f'{data["username"]} left {data["old_channel"]} and joined {pm_room}')
        # print(f'rooms: {rooms()}')

        emit("list channels", {"channels": channels, "messages": private_messages[pm_room], "redraw_messages": "yes", "users": users})          


@socketio.on('add msg')
def add_msg(data):
    # Add message to room
    room = data['channel']
    username = data['username']
    msg = data['msg']
    ts = data['ts']
    pm = data['pm']

    # Make a message entry, which is a list of username, message, timestamp
    new_msg_entry = [username, msg, ts]

    if pm == 'yes':
        # Calculate actual room name based on client name and second party
        # Don't need to join room (already in it), just need to append message to right list
        pm_room = find_pm_room(sanitize_channel_name(data['username']), data['channel'])

        # print(pm_room)
        # print(private_messages)

        # Enforce a message limit.  If we're at or over the limit now, pop one off the front
        # if (private_messages[pm_room] is not None) and (len(private_messages[pm_room]) >= room_message_limit):
        if len(private_messages[pm_room]) >= room_message_limit:
            private_messages[pm_room].pop(0)

        # Private messages is a list, append new message
        private_messages[pm_room].append(new_msg_entry)

        # Send it back out for other users.  Just the one new message!
        emit('new msg', {"msg": new_msg_entry}, room=pm_room)
    
    else:
        # Not a private message.  Same code as before.
        # Enforce a message limit.  If we're at or over the limit now, pop one off the front
        # if (messages[room] is not None) and (len(messages[room]) >= room_message_limit):
        if len(messages[room]) >= room_message_limit:
            messages[room].pop(0)

        # Messages is a list, append new message
        messages[room].append(new_msg_entry)

        # Send it back out for other users.  Just the one new message!
        emit('new msg', {"msg": new_msg_entry}, room=room)


@socketio.on('disconnect')
def user_disconnect():
    # Look up the SID of whoever just left
    id = request.sid
    username = user_sid[id]
    # print(f'{username} just left!')
    # print(users)
    # print(user_sid)
    # print(username)
    # print(id)

    # Remove them from user list. Not so easy because store display name and channel name in there
    # A list of dictionaries
    for user in users:
        if user['userdisplay'] == username:
            users.remove(user)
            break

    # And remove from user_sid
    del user_sid[id]

    # print("After removal..")
    # print(users)
    # print(user_sid)

    # Lastly, update people's channels list to show that user as no longer online
    # emit("list channels", {"channels": channels, "messages": private_messages[pm_room], "redraw_messages": "yes", "users": users}, broadcast=True)      # Also need to broadcast when a user joins, updates their Online Users list
    emit("list channels", {"channels": channels, "messages": [], "redraw_messages": "no", "users": users}, broadcast=True)


if __name__ == '__main__':
    if debug:
        # Run with debug on to not have to restart the server upon making changes.
        socketio.run(app, debug=True)
    else:
        socketio.run(app, debug=False)