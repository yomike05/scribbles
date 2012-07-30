var http = require('http'),
    url = require('url'),
    fs = require('fs'),
    moniker = require('moniker'),
    io = require('socket.io');

var rooms = [],
    users = [];

var Handlers = {
  index: function(request, response) {
    var query = url.parse(request.url, true).query,
        path =  ('roomId' in query && rooms[query["roomId"]] ? '/room.html' : '/index.html');
    fs.readFile(__dirname + path, function(err, data) {
      response.writeHead(200, {'Content-Type': 'text/html', 'Cache-Control' : 'no-cache'});
      response.write(data, 'utf8');
      response.end();
    });    
  },
  staticFile: function(request, response) {
    var mime = {
      js : 'application/javascript',
      html : 'text/html',
      css : 'text/css',
      png : 'image/png'
    }
    var defaultMime = mime["html"],
        path = url.parse(request.url).pathname,
        ext = (path.lastIndexOf(".") >= 0 ? path.substr(path.lastIndexOf(".") + 1) : "");
    fs.readFile(__dirname + path, function(err, data) {
      if (err) 
        Handlers.fourOhFour(request, response);
      else {
        response.writeHead(200, {'Content-Type': mime[ext] || defaultMime});
        response.write(data, 'utf8');
        response.end();
      }
    });
  },
  getRoomList: function (request, response) {
    var roomList = [];
    for (var roomId in rooms) 
      roomList.push ({roomId: roomId, clientCount: rooms[roomId].clientCount});
    response.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control' : 'no-cache'});
    response.end(JSON.stringify(roomList));
  },
  getRandomBoard: function (request, response) {
    var possibleRooms = [];
    for (var roomId in rooms) 
      if (rooms[roomId].whiteboardEvents.length > 0)
        possibleRooms.push(roomId);
    response.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control' : 'no-cache'});
    var board = { roomId : null, events : []}
    if (possibleRooms.length > 0) {
      var index = Math.floor(Math.random() * possibleRooms.length);
      board.roomId = possibleRooms[index]
      board.events = rooms[board.roomId].whiteboardEvents;
    }
    response.end(JSON.stringify(board));
  },
  createRoom: function(request, response){
    var roomId = moniker.choose();
    rooms[roomId] = { 
      users : [], 
      whiteboardEvents : [], 
      chat : [],
      clientCount : 0}; 
    console.log ('created room ' + roomId);
    response.writeHead(302, {'Location': '/?roomId=' + roomId});
    response.end();
  },
  fourOhFour: function(request, response){
    response.writeHead(404);
    response.write('File not found');
    response.end();    
  }
}

var routes = [
    { regex: /^\/$/, handler: Handlers.index  },
    { regex: /^\/get_rooms$/, handler: Handlers.getRoomList  },
    { regex: /^\/random_board$/, handler: Handlers.getRandomBoard  },
    { regex: /^\/create_room$/, handler: Handlers.createRoom  },
    { regex: /^\/static\/.+$/, handler: Handlers.staticFile  },
    { regex: /^\/.+$/, handler: Handlers.fourOhFour  }
  ];

var server = http.createServer(function (request, response) {
  var path = url.parse(request.url).pathname;
  for (var i = 0, l = routes.length; i < l; i++) {
    var route = routes[i];
    var match = path.match(route.regex);
    if (match) {
      route.handler(request, response);
      return;
    }
  }
});

io = io.listen(server).set('log level', 1);

io.sockets.on('connection', function(socket) {

  socket.on('message', function(data) {
    var roomId = data.roomId;
    console.log(data.message);
    rooms[roomId].chat.push(data.message);
    io.sockets.in(roomId).emit('chat', {'message': data.message});
  });

  socket.on('draw', function(data) {
    var roomId = data.roomId,
        draw = {socketid: socket.id, x :data.x, y : data.y, type: data.type};
    rooms[roomId].whiteboardEvents.push(draw);
    socket.broadcast.to(roomId).emit('draw', draw);
  });

  socket.on('clear', function(data) {
    var roomId = data.roomId;
    rooms[roomId].whiteboardEvents = [];
    io.sockets.in(roomId).emit('clear');
  });

  socket.on('ready', function(data){
    var roomId = data.roomId;
    console.log("setting up client #" + (++rooms[roomId].clientCount) + " for room " + roomId);
    socket.join(roomId);
    users[socket.id] = { username: socket.id, roomId : roomId };
    io.sockets.in(roomId).emit('clientcount', { clientCount: rooms[roomId].clientCount });
    socket.emit('chat', {'message': rooms[roomId].chat });
    socket.emit('setup', {'events' : rooms[roomId].whiteboardEvents, 'options' : {} })
  });

  socket.on('disconnect', function(data) {
    if (socket.id in users) {
      var roomId = users[socket.id].roomId;
      rooms[roomId].clientCount--;
      io.sockets.in(roomId).emit('clientcount', { clientCount: rooms[roomId].clientCount });
      console.log("user disconnected from room " + roomId + " (" + rooms[roomId].clientCount + " users left)");
    }
  });
});

var port = process.env.PORT || (process.argv[2] || 8001);
server.listen(port) && console.log('server started on port ' + port);