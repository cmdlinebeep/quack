# Project 2 -- Quack

#### Web Programming with Python and JavaScript

Quack is a spin on the popular messaging/chat/productivity/time-waster app, Slack.  Users can join public rooms or "channels" and post and read content
shared there.  In this app, they can also private message another user by clicking on them.

I had fun with this assignment.  My big challenge to myself was to make the page look good on both desktop and mobile.  You be the judge, but I think it hits
that goal.  When the view is small, a vertical ellipsis icon expands the menu on mobile.  This menu can also be "dragged out" from the side.  

The personalization I added was the ability to Private Message.  I found this to be the most challenging part of this particular project.  

Another, smaller, personalization I had fun with was adding a colored circle avatar for each user, much the same way Gmail does in email conversations.  
These circle colors are determined by the 1st character of the user name (base color) and the 2nd character for shading.  As much code as possible is
done on the client side to reduce server load and enable scaling to larger audiences (even if just a homework assignment).

## Try it out first!
### http://quack-addicts.herokuapp.com/

## Video in action
### <update link>

## Helpful resources
1. I decided to try a new CSS/HTML framework for this project, and chose Materialize for its responsiveness (to hit my mobile goal) and popularity. https://materializecss.com
2. Of course the Flask-SocketIO documentation was most helpful.  https://flask-socketio.readthedocs.io/en/latest/

Quack!
--Joel