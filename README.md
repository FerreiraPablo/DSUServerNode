# DSU Server Node

DSU Server, for simulating DualShock Controller input for any kind of DSUClient using Javascript. Read more https://v1993.github.io/cemuhook-protocol/ 

## Installation

Use NPM to install foobar.

```bash
npm install https://github.com/FerreiraPablo/DSUServerNode
```

## Usage

Import the class, instantiate the server and modify the controller values. this is an example that activates the touchpad all controllers draws cute net and then sends the disconnection. you can console.log any controller to see it's properties. (Max. 4) most of them have to bee defined as pressure values from 0 to 255. Begin 0 not pressed at all and 255 totally pressed.

Read more https://v1993.github.io/cemuhook-protocol/ 

Example : 
```js
var DSUServer = require("./index.js");
var server = new DSUServer();
var drawingInterval = setInterval(function() {
    server.controllers.forEach(controller => {
        console.log(server.controllers.map(x => x.id))
        var padTouch = controller.pads[0];
        padTouch.id = 1;
        padTouch.active = 1;
        padTouch.position.y = Math.cos(padTouch.position.x++) * 1080

        if(padTouch.position.x > 1920) {
            controller.state = 0;
            clearInterval(drawingInterval);
        }
        server.updateController(controller);
    });
})

```

## Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

