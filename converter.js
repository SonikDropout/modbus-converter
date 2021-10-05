'use strict';
const fs = require('fs');

const SLAVE_ID = { X: 5, Y: 6 };
const PULSE_PER_REVOLUTION = { X: 10000, Y: 10000 };
const THREAD_PITCH = { X: 20, Y: 20 };
const GEAR_RATIO = { X: 3, Y: 1 };
const ACCELERATION = { X: 100, Y: 100 };
const DECCELERATION = ACCELERATION;
const VELOCITY = { X: 1000, Y: 1000 };
const DELAY = 0;

const pathCounter = { X: 0, Y: 0 };

const [input, output] = process.argv.slice(2);

const gcode = fs.readFileSync(input).toString().trim();
const commands = gcode
  .split('\n')
  .map((line) => line.trim().slice(0, -1))
  .filter((s) => s.startsWith('G1'));
  
if (commands.length > 15) {
  throw new Error(`To many paths in one file! Only suppports up to 15 paths!`)
}

const modBusCommands = [];

for (let i = 0; i < commands.length; ++i) {
  const [id, ...args] = commands[i].split(' ');
  if (id != 'G1') {
    throw new Error(
      `Invalid gcode line ${i + 1}: ${id} is not a valid command!`
    );
  }
  modBusCommands.push(...convertG1(i + 1, args, i < commands.length - 1));
  fs.writeFileSync(output, generateOutput(modBusCommands));
}

function convertG1(line, directives, hasNext) {
  const commands = directives.map((directive, i) =>
    getModBusMovement(line, directive, hasNext)
  );
  return commands;
}

function generateOutput(convertedCommands) {
  const messageSenderBody = convertedCommands
    .map(
      (cmd) =>
        `socketSendByte(SOCKET_NAME, [${Array.from(cmd).map(
          (n) => '0x' + n.toString(16).padStart(2, '0')
        )}]);`
    )
    .join('\r\n\t');
  return `
socketCreate(SOCKET_NAME, '192.168.255.1', 502);
socketAddListener(SOCKET_NAME, 'connection', sendModBusMessage);
socketOpen(SOCKET_NAME);
socketWaitConnection(SOCKET_NAME, 5000);

function sendModBusMessage() {
  ${messageSenderBody}
}
  `;
}

function getModBusMovement(line, directive, hasNext) {
  const modBusCommand = Buffer.alloc(8 * 2 + 7);
  const axis = directive[0];
  writeSlaveID(modBusCommand, axis, line);
  writeModBusHeaders(modBusCommand, axis, hasNext);
  writePulses(modBusCommand, axis, directive.slice(1), line);
  writeMovementParams(modBusCommand, axis);
  pathCounter[axis] += 1;
  return addTCPHeader(modBusCommand);
}

function writeSlaveID(buffer, axis, line) {
  if (!/^[XY]$/.test(axis)) {
    throw new Error(`Invalid gcode line ${line}: ${axis} is not valid axis!`);
  }
  buffer[0] = SLAVE_ID[axis];
}

function writeModBusHeaders(buffer, axis, hasNext) {
  let i = 1;
  buffer[i++] = 0x10;
  buffer[i++] = 0x62;
  buffer[i++] = pathCounter[axis] * 8;
  buffer[i++] = 0;
  buffer[i++] = 8;
  buffer[i++] = 0x10;
  buffer[i++] = hasNext ? 64 + pathCounter[axis] + 1 : 0;
  buffer[i++] = 0x41;
}

function writePulses(buffer, axis, distance, line) {
  distance = Number(distance);
  if (isNaN(distance)) {
    throw new Error(
      `Invalid gcode line ${line}: ${directive.slice(
        1
      )} is not valid transition!`
    );
  }
  let pulses =
    (distance / THREAD_PITCH[axis]) *
    PULSE_PER_REVOLUTION[axis] *
    GEAR_RATIO[axis];
  buffer.writeInt32BE(pulses, 9);
}

function writeMovementParams(buffer, axis) {
  let i = 13;
  const params = [
    VELOCITY[axis],
    ACCELERATION[axis],
    DECCELERATION[axis],
    DELAY,
  ];
  for (const num of params) {
    buffer.writeUInt16BE(num, i);
    i += 2;
  }
}

function addTCPHeader(packet) {
  const header = Buffer.alloc(6);
  header[1] = 2;
  header.writeUInt16BE(packet.length, 4);
  return Buffer.concat([header, packet]);
}