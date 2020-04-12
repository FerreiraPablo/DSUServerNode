var dgram = require('dgram');
var bufferpack = require('bufferpack');
var crc32 = require('buffer-crc32');
class DSUServer {
    createController(id) {
        return this.resetController({
            id: id,
            state: 2,
            model: 2,
            connection: 0x02,
            battery: 0x04,
            active: 1,
            mac: "NODEJ" + id,
            clients: [],
            packets: 0,
        });
    }

    resetController(controller) {
        return Object.assign(controller, {
            arrows: {
                left: 0,
                right: 0,
                up: 0,
                down: 0,
            },
            actions: {
                cross: 0,
                circle: 0,
                triangle: 0,
                square: 0,
                home: 0,
                pad: 0,
                options: 0,
                share: 0
            },
            leftStick: {
                axis: {
                    x: 128,
                    y: 128
                },
                pressed: 0
            },
            rightStick: {
                axis: {
                    x: 128,
                    y: 128
                },
                pressed: 0
            },
            triggers: {
                R1: 0,
                R2: 0,
                L1: 0,
                L2: 0
            },
            pads: {
                0: {
                    id: 0,
                    active: 0,
                    position: {
                        x: 0,
                        y: 0
                    }
                },
                1: {
                    id: 0,
                    active: 0,
                    position: {
                        x: 0,
                        y: 0
                    }
                }
            },
            motion: {
                timestamp: Date.now(),
                acceleration: {
                    x: 0.0,
                    y: -1.0,
                    z: 0.0
                },
                rotation: {
                    pitch: 0,
                    yaw: 0,
                    roll: 0
                }
            }
        });
    }
    addCRC(buffer, crc) {
        var start = [];
        var end = [];
        for (var i = 0; i < buffer.length; i++) {
            if (i < 8) {
                start.push(buffer[i])
            } else if (i >= 12) {
                end.push(buffer[i])
            }
        }
        return Buffer.concat([Buffer.from(start), bufferpack.pack('<I', [crc || 0]), Buffer.from(end)]);
    }


    validateMessage(buffer) {
        var reference = this;
        var data = bufferpack.unpack("<4s2HiI", buffer);
        var unverifiedBuffer = reference.addCRC(buffer, 0); //bufferpack.pack("<4s2HiI", data);
        if (unverifiedBuffer.length !== (data[2] + 16) || crc32.signed(unverifiedBuffer) != data[3]) {
            return false;
        }
        return true;
    }

    deserializeMessage(buffer) {
        if (this.validateMessage(buffer)) {
            var data = bufferpack.unpack("<4s2HiI", buffer);
            return {
                "name": data[0],
                "version": data[1],
                "length": data[2],
                "type": bufferpack.unpack('<1I', buffer, 16)[0],
                "buffer": buffer
            }
        }
    }


    replyMessage(message, client) {
        var reference = this;
        if (!message) {
            return;
        }
        switch (message.type) {
            case reference.DSUVersion:
                reference.server.send(reference.prepareReply(buffer.pack("<IH", [reference.DSUVersion, reference.DSUProtocolVersion])), client.port, client.address)
                break;
            case reference.DSUPorts:
                var expectedControllers = bufferpack.unpack('<1I', message.buffer, 20)[0];
                var controllers = [];
                for (var i = 0; i < 4; i++) {
                    if (expectedControllers > i && message.buffer.length > (24 + i)) {
                        controllers.push(bufferpack.unpack('<1B', message.buffer, (24 + i))[0])
                    }
                }
                for (var controlId of controllers) {
                    var controller = reference.controllers.filter(x => x.id == controlId)[0];
                    if (!controller) {
                        controller = reference.createController(controlId);
                        controller.clients.push({
                            address: client.address,
                            port: client.port,
                            timestamp: Date.now()
                        });
                        reference.controllers.push(controller)
                    }

                    var reply = reference.prepareReply(bufferpack.pack("<I4B6s2B", [
                        reference.DSUPorts,
                        controller.id,
                        controller.state,
                        controller.model,
                        controller.connection,
                        controller.mac,
                        controller.battery,
                        controller.active
                    ]));
                    reference.server.send(reply, client.port, client.address)
                }
                break;
            case reference.DSUPadData:
                var date = Date.now();
                var bufferPackedData = bufferpack.unpack('<2B6s', message.buffer, 20);
                var clientInformation = {
                    "redFlags": bufferPackedData[0],
                    "slot": bufferPackedData[1],
                    "macAddress": bufferPackedData[2]
                }
                for (let controller of reference.controllers) {
                    var existingClient = controller.clients.filter(x => x.address == client.address && x.port == client.port)[0];
                    if (existingClient) {
                        existingClient.timestamp = date;
                    } else {
                        controller.clients.push({
                            address: client.address,
                            port: client.port,
                            timestamp: date
                        })
                    }
                }
                break;
        }
    }

    checkClients(controller) {
        controller.clients.filter(x => Date.now() - x.timestamp > this.disconnectionTimeout).forEach(x => {
            controller.clients.splice(controller.clients.indexOf(x), 1);
        });
    }

    prepareReply(body) {
        var reference = this;
        var mockupHeader = bufferpack.pack("<4s2HiI", [reference.name, reference.DSUProtocolVersion, body.length, 0, reference.id]);
        var crc = crc32.signed(Buffer.concat([mockupHeader, body]))
        var securityHeader = bufferpack.pack("<4s2HiI", [reference.name, reference.DSUProtocolVersion, body.length, crc, reference.id]); //reference.addCRC(mockupHeader, crc);
        var replyData = Buffer.concat([securityHeader, body]);
        if (reference.validateMessage(replyData)) {
            return replyData;
        } else {
            throw "Invalid message";
        }
    }


    logButtons(controller) {
        var iterables = [controller.actions, controller.arrows, controller.triggers]
        for(var obj of iterables) {
            for(var i in obj) {
                if(obj[i]) {
                    console.log(i.toUpperCase(), "Pressed, force :", obj[i]);
                }   
            }
        }
    }

    serializeController(controller)  {
        var buttons = [0, 0]    
        if (controller.arrows.left) { buttons[0] |= 0x80; }
        if (controller.arrows.down) { buttons[0] |= 0x40; }
        if (controller.arrows.right) { buttons[0] |= 0x20; }
        if (controller.arrows.up) { buttons[0] |= 0x10; }

        if (controller.options) { buttons[0] |= 0x08; }
        if (controller.rightStick.pressed) { buttons[0] |= 0x04; }
        if (controller.leftStick.pressed) { buttons[0] |= 0x02; }
        if (controller.actions.share) { buttons[0] |= 0x01; }

        if (controller.actions.square) { buttons[1] |= 0x80; }
        if (controller.actions.cross) { buttons[1] |= 0x40; }
        if (controller.actions.circle) { buttons[1] |= 0x20; }
        if (controller.actions.triangle) { buttons[1] |= 0x10; }

        if (controller.triggers.R1) { buttons[1] |= 0x08; }
        if (controller.triggers.L1) { buttons[1] |= 0x04; }
        if (controller.triggers.R2) { buttons[1] |= 0x02; }
        if (controller.triggers.L2) { buttons[1] |= 0x01; }

        return [
            this.DSUPadData, // I - 4Bytes
            controller.id,
            controller.state,
            controller.model,
            controller.connection, //4B - 8Bytes
            controller.mac, // 6s - 12 Bytes
            controller.battery,
            controller.active, // 2B - 14 Bytes
            controller.packets, // 1L
            buttons[0],
            buttons[1],
            controller.actions.home,
            controller.actions.pad,
            controller.leftStick.axis.x,
            controller.leftStick.axis.y,
            controller.rightStick.axis.x,
            controller.rightStick.axis.y,
            controller.arrows.left,
            controller.arrows.down,
            controller.arrows.right,
            controller.arrows.up,
            controller.actions.square,
            controller.actions.cross,
            controller.actions.circle,
            controller.actions.triangle,
            controller.triggers.R1,
            controller.triggers.L1,
            controller.triggers.R2,
            controller.triggers.L2, //20B
            controller.pads[0].active,
            controller.pads[0].id, // 20B - 38 Bytes
            controller.pads[0].position.x,
            controller.pads[0].position.y, //2H - 42 Bytes
            controller.pads[1].active,
            controller.pads[1].id, // 2B - 44 Bytes 
            controller.pads[1].position.x,
            controller.pads[1].position.y,//2H - 48 Bytes
            Date.now(),
            Date.now(), // 2L - 56 Bytes
            controller.motion.acceleration.x,
            controller.motion.acceleration.y,
            controller.motion.acceleration.z,
            controller.motion.rotation.pitch,
            controller.motion.rotation.yaw,
            controller.motion.rotation.roll // 6f - 80
        ];
    }
    updateController(controller) {
        var reference = this;
        var stateSerialization = this.serializeController(controller);
        var actualData = JSON.stringify(stateSerialization);
        if(controller._lastUpdate && controller._lastUpdate == actualData) {
            return;
        }
        controller._lastUpdate = actualData;
        var reply = reference.prepareReply(bufferpack.pack("<I4B6s2BI20B2B2H2B2H2L6f", stateSerialization))
        this.checkClients(controller);
        controller.packets++;
        controller.clients.forEach(client => reference.server.send(reply, client.port, client.address));
    }

    updateControllers() {
        for (var controller of this.controllers) {
            this.updateController(controller);
        }
    }

    start() {
        var reference = this;
        this.controllers = [];
        this.name = "DSUS";
        this.DSUVersion = 0x100000;
        this.DSUPorts = 0x100001;
        this.DSUPadData = 0x100002;
        this.DSUProtocolVersion = 1001

        this.id = Math.random() * 0xFFFFFFFF;
        this.server = dgram.createSocket("udp4");
        this.clients = [];
        this.server.on("message", function (buffer, remoteInformation) {
            reference.replyMessage(reference.deserializeMessage(buffer), remoteInformation);
        });

        this.server.on("listening", function () {
        });
        this.server.bind(this.port);
    }
    
    revive() {
        this.server.close();
        this.server.unref();
        this.start();
    }

    constructor(port = 26760, disconnectionTimeout = 5000) {
        this.disconnectionTimeout = disconnectionTimeout
        this.port = port;
        this.start();
    }
}

module.exports = DSUServer;