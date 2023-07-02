const { WebSocketServer } = require("ws");
const uuid = require("uuid");
const cron = require("node-cron");

let clients = {};

let webSocketsList = [];

cron.schedule("*/5 * * * *", function () {
  console.log("---------------------");
  console.log("running a task every 15 seconds");
  //clients = {};
  for (let userId in clients) {
    let client = clients[userId];
    if(client.readyState != 1){
      delete clients[userId];
    }
  }
  console.log("axxx",clients)
});

initWebSockets = function (server) {
  const wsServer = new WebSocketServer({ server });
  //   A new client connection request received
  wsServer.on("connection", function (connection, req) {
    // Generate a unique code for every user
    const userId = uuid.v4();
    console.log(`Recieved a new connection.`, connection);
    clients[userId]=connection;
    // Store the new connection and handle messages
    // console.log(`${userId} connected.`);
  });
};
fireWebscoketEvent = function (type = 'general', data = {}) {
  console.log("clients", clients);

  const message = JSON.stringify({ type: type, data: data });
  for (let userId in clients) {
    let client = clients[userId];
    //if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    //}
  }

};
const websocket = {
  fireWebscoketEvent: fireWebscoketEvent,
  initWebSockets: initWebSockets,
};
module.exports = websocket;
