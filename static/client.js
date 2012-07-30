var Scribbles = {
  roomId : (function() {
      var roomId = null;
      $.each(document.location.search.substr(1).split('&'),function(c,q){
        var i = q.split('=');
        if (i[0].toString() == "roomId")
          roomId = i[1].toString();
      });
      return roomId;
    })(),
  canvasArr : [],
  newCanvas : function(socketid, options, callback) {
    var canvas = $("<canvas/>", { id: 'whiteboard_inner_' + socketid, style : 'position:absolute;'})[0];
    canvas.height = 2000;
    canvas.width = 2000;
    
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = (options && "fillStyle" in options ? options.fillStyle : "solid");
    ctx.strokeStyle = (options && "strokeStyle" in options ? options.strokeStyle : "#000");
    ctx.lineWidth = (options && "lineWidth" in options ? options.lineWidth : 5);
    ctx.lineCap = (options && "lineCap" in options ? options.lineCap : "round");

    $("#whiteboard").prepend(canvas);
    Scribbles.canvasArr[socketid] = canvas;

    if (callback) {
      var data = { canvasId : 'whiteboard_inner_' + socketid};
      callback(null, data);
    }
  },
  myCanvas : function() {
    Scribbles.newCanvas("self", {}, function(err, data) {
      $('#'+data.canvasId).live("mousedown mouseup", function(evt) {
        var type = evt.handleObj.type,
            obj = this;
        var handleMouseDrag = function (evt) {
          var type = evt.handleObj.type,
              offset = $(obj).offset(),
              x = evt.pageX - offset.left,
              y = evt.pageY - offset.top;
          Scribbles.draw("self", x, y, type);
          Scribbles.socket.emit('draw', {roomId : Scribbles.roomId, x : x, y : y, type : type})
        }
        if (type == "mousedown") {
          $('#whiteboard').css('z-index', 150);
          $('#'+data.canvasId).live("mousemove", handleMouseDrag);
        }
        else {
          if (type == "mouseup")
            $('#whiteboard').css('z-index', 50);
          $('#'+data.canvasId).die("mousemove");
        }
          
        handleMouseDrag(evt);
      });
    });
  },
  renew : function(callback) {
    Scribbles.canvasArr = [];
    $("#whiteboard").empty();
    Scribbles.myCanvas();
    if (callback) callback();
  },
  draw : function (socketid, x, y, type, options) {
    if (socketid != "self" && Scribbles.canvasArr[socketid] === undefined) 
      Scribbles.newCanvas(socketid, options);

    var ctx = Scribbles.canvasArr[socketid].getContext("2d");
    if (type == "mousedown") {
      ctx.beginPath();
      ctx.moveTo(x,y);
    }
    else if (type == "mousemove") {
      ctx.lineTo(x,y);
      ctx.stroke();
    }
    else 
      ctx.closePath();
  },
  replay : function(events, options) {
    for (var i in events) {
      var drawEvent = events[i];
      Scribbles.draw(drawEvent.socketid, drawEvent.x, drawEvent.y, drawEvent.type, options);
    }
  },
  setup : function(events, options) {
    Scribbles.renew(function() {
      Scribbles.replay(events, options);
    });
  },
  start : function () {
    $("#whiteboard").append('<div id="loading">Loading...</div>');
    
    Scribbles.socket = io.connect();

    var calcWindowHeight = function() {
      var elems = ["#whiteboard", "#shared-frame"],
          height = $(window).height() - $("#navbar").height();
      for (var i in elems) 
        $(elems[i]).height(height);
    }
    calcWindowHeight();

    $(window).resize(calcWindowHeight);

    $("#share").val(window.location);

    $('#exit-button').click(function(){
      window.location.href = '/';
    });

    $('#chat-form').submit( function() {
      if ($("#message").val().trim().length > 0) {
        Scribbles.socket.emit('message', { roomId : Scribbles.roomId, message: $("#message").val()});
        $("#message").val("");
      }
      return false;
    });

    $('#clear-button').click(function(e){
      Scribbles.socket.emit('clear', { roomId : Scribbles.roomId});
    });

    Scribbles.socket.on('chat', function(data){
      if (!$.isArray(data.message)) data.message = [data.message];
      for (var i in data.message)
        $('#chat > ul').append("<li>&gt; " + data.message[i] + "</li>");
      $('#chat').scrollTop($('#chat')[0].scrollHeight);
    });

    Scribbles.socket.on('draw', function(data){
      Scribbles.draw(data.socketid, data.x, data.y, data.type);
    });

    Scribbles.socket.on('clear', function(data){
      Scribbles.clear();
    });

    Scribbles.socket.on('clientcount', function(data){
      $('#client-count').text(data.clientCount);
    });

    Scribbles.socket.on('replay', function(data){
      Scribbles.replay(data.events, data.options);
    });

    Scribbles.socket.on('setup', function(data){
      Scribbles.setup(data.events, data.options);
    });

    Scribbles.socket.emit('ready', { roomId : Scribbles.roomId});
  }
}